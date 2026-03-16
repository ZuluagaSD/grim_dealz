"""
Claude-powered product matcher for GrimDealz.

When a scraper finds a product that can't be confidently matched by catalog code
+ name similarity alone, this module uses Claude Haiku to identify the correct
GW product from a list of candidates.

Matches are cached in a `product_matches` table so Claude is only called once
per unique retailer product. Cost: ~$0.0002 per match.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

import httpx
import psycopg

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-3-haiku-20240307"
API_URL = "https://api.anthropic.com/v1/messages"


@dataclass
class MatchResult:
    product_id: str | None
    product_name: str | None
    confidence: float  # 0.0 - 1.0
    reason: str


async def _call_claude(retailer_name: str, retailer_code: str, candidates: list[dict]) -> MatchResult:
    """Ask Claude to match a retailer product to the correct GW product."""
    if not ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set — skipping Claude match")
        return MatchResult(None, None, 0.0, "no_api_key")

    candidate_list = "\n".join(
        f"  {i+1}. ID={c['id']} | Name={c['name']} | Item#={c['gw_item_number']} | Code={c.get('gw_catalog_code', 'N/A')} | RRP=${c['rrp']}"
        for i, c in enumerate(candidates)
    )

    prompt = f"""A retailer is selling a Games Workshop Warhammer product. Match it to the correct product from our database.

Retailer product:
  Name: "{retailer_name}"
  Catalog code: "{retailer_code}"

Candidate products from our database:
{candidate_list}

If NONE of the candidates are a match, respond with match_index: 0.

Respond in JSON only:
{{"match_index": <1-based index or 0 if no match>, "confidence": <0.0-1.0>, "reason": "<brief explanation>"}}"""

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                API_URL,
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": MODEL,
                    "max_tokens": 150,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()

        text = data["content"][0]["text"].strip()
        # Extract JSON from response (handle markdown code blocks)
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)
        match_idx = int(result.get("match_index", 0))
        confidence = float(result.get("confidence", 0.0))
        reason = result.get("reason", "")

        if match_idx > 0 and match_idx <= len(candidates):
            matched = candidates[match_idx - 1]
            return MatchResult(matched["id"], matched["name"], confidence, reason)
        else:
            return MatchResult(None, None, confidence, reason or "no_match")

    except Exception as exc:
        logger.error("Claude matcher error: %s", exc)
        return MatchResult(None, None, 0.0, f"error: {exc}")


async def get_cached_match(
    conn: psycopg.AsyncConnection,
    store_slug: str,
    retailer_code: str,
    retailer_name: str,
) -> str | None:
    """Check if we already have a cached Claude match for this retailer product."""
    row = await (
        await conn.execute(
            """SELECT product_id FROM product_matches
               WHERE store_slug = %s AND retailer_code = %s AND product_id IS NOT NULL""",
            (store_slug, retailer_code),
        )
    ).fetchone()
    return row[0] if row else None


async def get_cached_rejection(
    conn: psycopg.AsyncConnection,
    store_slug: str,
    retailer_code: str,
) -> bool:
    """Check if Claude previously rejected this retailer product (no match)."""
    row = await (
        await conn.execute(
            """SELECT 1 FROM product_matches
               WHERE store_slug = %s AND retailer_code = %s AND product_id IS NULL""",
            (store_slug, retailer_code),
        )
    ).fetchone()
    return row is not None


async def save_match(
    conn: psycopg.AsyncConnection,
    store_slug: str,
    retailer_code: str,
    retailer_name: str,
    product_id: str | None,
    confidence: float,
    reason: str,
) -> None:
    """Cache a Claude match result."""
    await conn.execute(
        """INSERT INTO product_matches (store_slug, retailer_code, retailer_name, product_id, confidence, reason, matched_at)
           VALUES (%s, %s, %s, %s, %s, %s, NOW())
           ON CONFLICT (store_slug, retailer_code) DO UPDATE SET
             product_id = EXCLUDED.product_id,
             retailer_name = EXCLUDED.retailer_name,
             confidence = EXCLUDED.confidence,
             reason = EXCLUDED.reason,
             matched_at = NOW()""",
        (store_slug, retailer_code, retailer_name, product_id, confidence, reason),
    )
    await conn.commit()


async def claude_match_product(
    conn: psycopg.AsyncConnection,
    store_slug: str,
    retailer_code: str,
    retailer_name: str | None,
) -> MatchResult:
    """Match a retailer product using Claude, with caching.

    1. Check cache first
    2. If not cached, find candidates from DB
    3. Ask Claude to pick the best match
    4. Cache the result
    """
    if not retailer_name:
        return MatchResult(None, None, 0.0, "no_retailer_name")

    # Check cache
    cached_id = await get_cached_match(conn, store_slug, retailer_code, retailer_name)
    if cached_id:
        logger.debug("[claude] Cache hit for %s/%s → %s", store_slug, retailer_code, cached_id)
        row = await (
            await conn.execute("SELECT name FROM products WHERE id = %s", (cached_id,))
        ).fetchone()
        return MatchResult(cached_id, row[0] if row else None, 1.0, "cached")

    if await get_cached_rejection(conn, store_slug, retailer_code):
        logger.debug("[claude] Cached rejection for %s/%s", store_slug, retailer_code)
        return MatchResult(None, None, 0.0, "cached_rejection")

    # Find candidates: search by catalog code AND fuzzy name
    candidates = []

    # By catalog code
    rows = await (
        await conn.execute(
            """SELECT id, name, gw_item_number, gw_catalog_code, gw_rrp_usd
               FROM products WHERE gw_catalog_code = %s AND is_active = TRUE LIMIT 5""",
            (retailer_code,),
        )
    ).fetchall()

    for r in rows:
        candidates.append({
            "id": r[0], "name": r[1], "gw_item_number": r[2],
            "gw_catalog_code": r[3], "rrp": str(r[4]),
        })

    # By name similarity (search for words from retailer name)
    if retailer_name:
        words = [w for w in retailer_name.split() if len(w) > 3][:4]
        if words:
            like_pattern = "%" + "%".join(words) + "%"
            name_rows = await (
                await conn.execute(
                    """SELECT id, name, gw_item_number, gw_catalog_code, gw_rrp_usd
                       FROM products WHERE name ILIKE %s AND is_active = TRUE LIMIT 10""",
                    (like_pattern,),
                )
            ).fetchall()

            existing_ids = {c["id"] for c in candidates}
            for r in name_rows:
                if r[0] not in existing_ids:
                    candidates.append({
                        "id": r[0], "name": r[1], "gw_item_number": r[2],
                        "gw_catalog_code": r[3], "rrp": str(r[4]),
                    })

    if not candidates:
        logger.info("[claude] No candidates found for %s/%s (%s)", store_slug, retailer_code, retailer_name)
        await save_match(conn, store_slug, retailer_code, retailer_name, None, 0.0, "no_candidates")
        return MatchResult(None, None, 0.0, "no_candidates")

    # Ask Claude
    logger.info("[claude] Matching %s/%s (%s) against %d candidates", store_slug, retailer_code, retailer_name, len(candidates))
    result = await _call_claude(retailer_name, retailer_code, candidates)

    # Cache
    await save_match(
        conn, store_slug, retailer_code, retailer_name,
        result.product_id, result.confidence, result.reason,
    )

    if result.product_id:
        logger.info("[claude] Matched: %s → %s (%.0f%% confidence: %s)", retailer_name, result.product_name, result.confidence * 100, result.reason)
    else:
        logger.info("[claude] No match: %s (%s)", retailer_name, result.reason)

    return result
