"""
GrimDealz — one-time catalog-code enrichment.

Populates products.gw_catalog_code (the XX-XX retailer format, e.g. "48-75")
by fetching product pages from Miniature Market and Discount Games Inc, then
name-matching against existing DB rows seeded from Algolia.

Why this is needed:
  seed_catalog.py stores 11-digit Algolia IDs (e.g. "99120101309") in
  gw_item_number. Both MM and DGI expose the short retail catalog code (XX-XX).
  This script populates gw_catalog_code so db.py can match scraped results.

Strategy:
  Pass 1 — Miniature Market (914 GW products):
    - Parse MM sitemap → gw-XX-XX.html URLs (item code in URL itself)
    - Fetch each page → extract og:title (product name)
    - Exact case-insensitive name match → UPDATE gw_catalog_code

  Pass 2 — Discount Games Inc (fills gaps not covered by MM):
    - Paginate all 13 GW category pages → collect product URLs
    - Fetch each page → extract MPN (GAWXX-XX → XX-XX) + og:title name
    - Match by name → UPDATE gw_catalog_code (skip if already set by Pass 1)

Usage:
  uv run python -m scrapers.enrich_catalog_codes          # both passes
  uv run python -m scrapers.enrich_catalog_codes --mm-only
  uv run python -m scrapers.enrich_catalog_codes --dgi-only
  DRY_RUN=1 uv run python -m scrapers.enrich_catalog_codes  # no DB writes
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import logging
import os
import re
import sys
from xml.etree import ElementTree as ET

import httpx
import psycopg
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
_DSN = os.environ["DIRECT_URL"]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; GrimDealzBot/1.0; "
        "+https://grimdealz.com/bot)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# ── Miniature Market ─────────────────────────────────────────────────
_MM_SITEMAP_INDEX = "https://www.miniaturemarket.com/sitemap.xml"
_MM_SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_MM_CONCURRENCY = 8
_MM_SLEEP = 0.4

# ── Discount Games Inc ───────────────────────────────────────────────
_DGI_BASE_URL = "https://www.discountgamesinc.com"
_DGI_CATEGORIES = [
    "/miniatures-games/games-workshop/warhammer-40000/",
    "/miniatures-games/games-workshop/age-of-sigmar/",
    "/miniatures-games/games-workshop/kill-team/",
    "/miniatures-games/games-workshop/blood-bowl/",
    "/miniatures-games/games-workshop/necromunda/",
    "/miniatures-games/games-workshop/the-horus-heresy/",
    "/miniatures-games/games-workshop/the-old-world/",
    "/miniatures-games/games-workshop/warcry/",
    "/miniatures-games/games-workshop/underworlds/",
    "/miniatures-games/games-workshop/middle-earth/",
    "/miniatures-games/games-workshop/adeptus-titanicus/",
    "/miniatures-games/games-workshop/warhammer-quest/",
    "/paints-hobby-supplies/modeling-tools-accessories/games-workshop-citadel/",
]
_DGI_CONCURRENCY = 4
_DGI_CAT_CONCURRENCY = 3
_DGI_SLEEP = 0.5


# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────


def _extract_page_name(html: str) -> str | None:
    """Extract product name from og:title or h1.

    Strips " | Store Name" suffixes that some sites append to og:title.
    """
    soup = BeautifulSoup(html, "html.parser")
    og = soup.find("meta", property="og:title")
    if og:
        content = (og.get("content") or "").strip()
        if content:
            return content.split(" | ")[0].strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(separator=" ").strip()
    return None


def _mm_extract_item_number(url: str) -> str | None:
    m = re.search(r"/gw-(\d{2}-\d{2})\.html", url)
    return m.group(1) if m else None


def _dgi_extract_mpn(html: str) -> str | None:
    """Extract GW item number from DGI product page MPN field."""
    soup = BeautifulSoup(html, "html.parser")
    mpn_tag = soup.find("meta", attrs={"itemprop": "mpn"})
    if not mpn_tag:
        return None
    mpn = (mpn_tag.get("content") or "").strip().upper()
    if mpn.startswith("GAW"):
        candidate = mpn[3:]
        if re.fullmatch(r"\d{2}-\d{2}", candidate):
            return candidate
    return None


# ─────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────


async def ensure_column(conn: psycopg.AsyncConnection) -> None:
    """Add gw_catalog_code column + index if they don't exist yet."""
    await conn.execute(
        'ALTER TABLE products ADD COLUMN IF NOT EXISTS gw_catalog_code TEXT'
    )
    await conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS products_gw_catalog_code_key "
        "ON products(gw_catalog_code)"
    )
    await conn.commit()
    logger.info("gw_catalog_code column ready")


async def match_product(
    conn: psycopg.AsyncConnection, name: str
) -> str | None:
    """Return product.id where name matches (case-insensitive) and
    gw_catalog_code is not yet set. Returns None if no match."""
    row = await (
        await conn.execute(
            "SELECT id FROM products "
            "WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s)) "
            "AND gw_catalog_code IS NULL",
            (name,),
        )
    ).fetchone()
    return row[0] if row else None


async def update_catalog_code(
    conn: psycopg.AsyncConnection, product_id: str, code: str
) -> None:
    if DRY_RUN:
        logger.debug("[DRY] Would set gw_catalog_code=%s for id=%s", code, product_id)
        return
    await conn.execute(
        "UPDATE products SET gw_catalog_code = %s WHERE id = %s",
        (code, product_id),
    )
    await conn.commit()


# ─────────────────────────────────────────
# Pass 1: Miniature Market
# ─────────────────────────────────────────


async def run_mm_pass(
    client: httpx.AsyncClient,
    conn: psycopg.AsyncConnection,
) -> tuple[int, int]:
    """Fetch MM sitemap, iterate product pages, populate gw_catalog_code.

    Returns (matched, attempted).
    """
    # 1. Sitemap index → find .xml.gz
    logger.info("[MM] Fetching sitemap index...")
    resp = await client.get(_MM_SITEMAP_INDEX)
    root = ET.fromstring(resp.text)
    gz_urls = [
        elem.text
        for elem in root.findall(f".//{{{_MM_SITEMAP_NS}}}loc")
        if elem.text and elem.text.endswith(".xml.gz")
    ]
    if not gz_urls:
        logger.error("[MM] No .xml.gz found in sitemap index")
        return 0, 0

    # 2. Download + decompress child sitemap
    logger.info("[MM] Downloading sitemap: %s", gz_urls[0])
    resp = await client.get(gz_urls[0])
    xml_bytes = gzip.decompress(resp.content)
    sitemap_root = ET.fromstring(xml_bytes)

    product_urls = [
        elem.text
        for elem in sitemap_root.findall(f".//{{{_MM_SITEMAP_NS}}}loc")
        if elem.text and re.search(r"/gw-\d{2}-\d{2}\.html$", elem.text)
    ]
    logger.info("[MM] %d GW product URLs in sitemap", len(product_urls))

    # 3. Fetch pages concurrently
    sem = asyncio.Semaphore(_MM_CONCURRENCY)
    matched = 0
    attempted = 0
    unmatched_names: list[str] = []

    async def process_url(url: str) -> None:
        nonlocal matched, attempted
        item_number = _mm_extract_item_number(url)
        if not item_number:
            return

        async with sem:
            await asyncio.sleep(_MM_SLEEP)
            try:
                resp = await client.get(url)
            except Exception as exc:
                logger.debug("[MM] Fetch error %s: %s", url, exc)
                return

        name = _extract_page_name(resp.text)
        if not name:
            logger.debug("[MM] No name found at %s", url)
            return

        attempted += 1
        product_id = await match_product(conn, name)
        if product_id:
            await update_catalog_code(conn, product_id, item_number)
            matched += 1
            logger.debug("[MM] ✓ %s → %s", item_number, name)
        else:
            unmatched_names.append(f"{item_number}: {name!r}")

    await asyncio.gather(*[process_url(u) for u in product_urls])

    logger.info(
        "[MM] Pass complete: %d/%d matched (gw_catalog_code set)", matched, attempted
    )
    if unmatched_names:
        logger.warning(
            "[MM] %d products not matched in DB:\n  %s",
            len(unmatched_names),
            "\n  ".join(unmatched_names[:20]),
        )
    return matched, attempted


# ─────────────────────────────────────────
# Pass 2: Discount Games Inc
# ─────────────────────────────────────────


async def _dgi_paginate_category(
    client: httpx.AsyncClient,
    category_path: str,
    sem: asyncio.Semaphore,
) -> set[str]:
    """Collect all unique product URLs from one DGI category (with pagination)."""
    seen: set[str] = set()
    page = 1
    while True:
        url = (
            f"{_DGI_BASE_URL}{category_path}"
            if page == 1
            else f"{_DGI_BASE_URL}{category_path.rstrip('/')}/page{page}.html"
        )
        try:
            async with sem:
                resp = await client.get(url)
            await asyncio.sleep(_DGI_SLEEP)
            soup = BeautifulSoup(resp.text, "html.parser")
            page_urls = {
                tag["data-url"]
                for tag in soup.find_all(attrs={"data-url": True})
                if "discountgamesinc.com/" in tag.get("data-url", "")
            }
            new = page_urls - seen
            if not new:
                break
            seen.update(new)
            page += 1
        except Exception as exc:
            logger.debug("[DGI] Category page error %s: %s", url, exc)
            break
    return seen


async def run_dgi_pass(
    client: httpx.AsyncClient,
    conn: psycopg.AsyncConnection,
) -> tuple[int, int]:
    """Paginate DGI categories, fetch product pages, populate gw_catalog_code.

    Returns (matched, attempted).
    """
    logger.info("[DGI] Collecting product URLs from %d categories...", len(_DGI_CATEGORIES))
    cat_sem = asyncio.Semaphore(_DGI_CAT_CONCURRENCY)
    per_cat = await asyncio.gather(
        *[_dgi_paginate_category(client, path, cat_sem) for path in _DGI_CATEGORIES]
    )
    product_urls = set().union(*per_cat)
    logger.info("[DGI] %d unique product URLs collected", len(product_urls))

    sem = asyncio.Semaphore(_DGI_CONCURRENCY)
    matched = 0
    attempted = 0
    unmatched_names: list[str] = []

    async def process_url(url: str) -> None:
        nonlocal matched, attempted
        async with sem:
            await asyncio.sleep(_DGI_SLEEP)
            try:
                resp = await client.get(url)
            except Exception as exc:
                logger.debug("[DGI] Fetch error %s: %s", url, exc)
                return

        item_number = _dgi_extract_mpn(resp.text)
        if not item_number:
            return  # Not a GW product

        name = _extract_page_name(resp.text)
        if not name:
            return

        attempted += 1
        product_id = await match_product(conn, name)
        if product_id:
            await update_catalog_code(conn, product_id, item_number)
            matched += 1
            logger.debug("[DGI] ✓ %s → %s", item_number, name)
        else:
            unmatched_names.append(f"{item_number}: {name!r}")

    await asyncio.gather(*[process_url(u) for u in product_urls])

    logger.info(
        "[DGI] Pass complete: %d/%d matched (gw_catalog_code set)", matched, attempted
    )
    if unmatched_names:
        logger.warning(
            "[DGI] %d products not matched in DB:\n  %s",
            len(unmatched_names),
            "\n  ".join(unmatched_names[:20]),
        )
    return matched, attempted


# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────


async def main(run_mm: bool = True, run_dgi: bool = True) -> None:
    if DRY_RUN:
        logger.info("DRY RUN — no DB writes")

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=httpx.Timeout(30.0, connect=10.0),
        follow_redirects=True,
        http2=True,
    ) as client:
        async with await psycopg.AsyncConnection.connect(_DSN) as conn:
            await ensure_column(conn)

            total_matched = 0
            total_attempted = 0

            if run_mm:
                m, a = await run_mm_pass(client, conn)
                total_matched += m
                total_attempted += a

            if run_dgi:
                m, a = await run_dgi_pass(client, conn)
                total_matched += m
                total_attempted += a

            # Final tally
            row = await (
                await conn.execute(
                    "SELECT COUNT(*) FROM products WHERE gw_catalog_code IS NOT NULL"
                )
            ).fetchone()
            populated = row[0] if row else 0

            logger.info(
                "=== Enrichment complete ===\n"
                "  Matched this run:      %d / %d attempted\n"
                "  Total gw_catalog_code: %d products",
                total_matched,
                total_attempted,
                populated,
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Populate products.gw_catalog_code from MM and DGI product pages"
    )
    parser.add_argument("--mm-only", action="store_true", help="Run MM pass only")
    parser.add_argument("--dgi-only", action="store_true", help="Run DGI pass only")
    args = parser.parse_args()

    run_mm = not args.dgi_only
    run_dgi = not args.mm_only

    asyncio.run(main(run_mm=run_mm, run_dgi=run_dgi))
