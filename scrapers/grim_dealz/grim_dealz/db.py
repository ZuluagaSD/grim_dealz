"""
GrimDealz DB helpers — upsert scraped results to Supabase (PostgreSQL).

Uses psycopg3 directly with the DIRECT_URL for write operations.
(The Next.js app uses the pooled DATABASE_URL via Prisma.)

Key logic:
- Upserts listings ON CONFLICT(product_id, store_id)
- Writes price_history row ONLY when price or stock status changes
- Computes discount_pct via JOIN to products.gw_rrp_usd (not stored on listing)
- Logs stats: matched, upserted, price_history rows written, unmatched items

Usage:
    from grim_dealz.db import stream_upsert
    stats = await stream_upsert(store_slug="miniature-market", scrape_iter=scraper.scrape())
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from decimal import Decimal
from difflib import SequenceMatcher

import psycopg
from dotenv import load_dotenv

from .base_store import PriceResult
from .claude_matcher import claude_match_product

load_dotenv()

logger = logging.getLogger(__name__)

# Use DIRECT_URL for writes — bypasses Supavisor transaction mode which
# doesn't support RETURNING or multi-statement transactions well for bulk upserts
def _get_dsn() -> str:
    dsn = os.environ.get("DIRECT_URL")
    if not dsn:
        raise RuntimeError("DIRECT_URL environment variable is required")
    return dsn


@dataclass
class UpsertStats:
    store_slug: str
    total_scraped: int = 0
    matched: int = 0        # found a product row for this gw_item_number
    upserted: int = 0       # listing row created or updated
    price_changes: int = 0  # price_history rows written
    unmatched: list[str] = field(default_factory=list)  # gw_item_numbers not in products
    errors: list[str] = field(default_factory=list)

    def log_summary(self) -> None:
        logger.info(
            "[%s] scraped=%d matched=%d upserted=%d price_changes=%d unmatched=%d errors=%d",
            self.store_slug,
            self.total_scraped,
            self.matched,
            self.upserted,
            self.price_changes,
            len(self.unmatched),
            len(self.errors),
        )
        if self.unmatched:
            logger.warning("[%s] Unmatched item numbers: %s", self.store_slug, self.unmatched[:20])


_MAX_RETRIES = 3
_RETRY_BACKOFF_BASE = 2  # seconds


async def _connect_and_get_store_id(store_slug: str) -> tuple[psycopg.AsyncConnection, str, str]:
    """Connect to DB and resolve store_id and currency. Raises if store not found."""
    conn = await psycopg.AsyncConnection.connect(_get_dsn())
    row = await conn.execute(
        "SELECT id, COALESCE(currency, 'USD') FROM stores WHERE slug = %s AND is_active = TRUE",
        (store_slug,),
    )
    store_row = await row.fetchone()
    if store_row is None:
        await conn.close()
        raise ValueError(f"Store not found or inactive: {store_slug!r}")
    return conn, store_row[0], store_row[1]


async def _upsert_batch_with_retry(
    store_slug: str,
    store_id: str,
    batch: list[PriceResult],
    stats: UpsertStats,
    conn: psycopg.AsyncConnection | None,
    log=None,
    currency: str = "USD",
) -> psycopg.AsyncConnection:
    """Upsert a batch with retry logic. Returns the (possibly new) connection."""
    _log = log or logger
    
    for attempt in range(_MAX_RETRIES):
        try:
            # Reconnect if connection is None or closed
            if conn is None or conn.closed:
                _log.info("[%s] Reconnecting to database (attempt %d)...", store_slug, attempt + 1)
                conn, _ = await _connect_and_get_store_id(store_slug)
                # Re-fetch store_id after reconnect
                row = await conn.execute(
                    "SELECT id FROM stores WHERE slug = %s AND is_active = TRUE",
                    (store_slug,),
                )
                store_row = await row.fetchone()
                store_id = store_row[0]
            
            # Try to upsert the batch
            for result in batch:
                try:
                    await _upsert_one(conn, store_slug, store_id, result, stats, currency=currency)
                except psycopg.OperationalError:
                    raise  # Re-raise connection errors to trigger retry
                except Exception as exc:
                    msg = f"{result.gw_item_number}: {exc}"
                    stats.errors.append(msg)
                    logger.exception("[%s] Error upserting %s", store_slug, result.gw_item_number)
            
            return conn  # Success
            
        except psycopg.OperationalError as exc:
            _log.warning("[%s] DB connection error (attempt %d/%d): %s", 
                        store_slug, attempt + 1, _MAX_RETRIES, exc)
            if conn and not conn.closed:
                try:
                    await conn.close()
                except Exception:
                    pass
            conn = None
            
            if attempt < _MAX_RETRIES - 1:
                backoff = _RETRY_BACKOFF_BASE ** (attempt + 1)
                _log.info("[%s] Retrying in %ds...", store_slug, backoff)
                await asyncio.sleep(backoff)
            else:
                raise  # Final attempt failed
    
    return conn  # Should not reach here


async def stream_upsert(
    store_slug: str,
    scrape_iter: AsyncIterator[list[PriceResult]],
    log=None,
) -> UpsertStats:
    """Upsert scraped PriceResults for one store, consuming an async iterator of batches.

    Opens a DB connection for the scrape run. Each batch yielded by the scraper
    is written immediately. If the connection fails, it will retry with
    exponential backoff and reconnect automatically.

    Pass a Dagster `context.log` as `log` to emit per-batch events to the UI.
    """
    stats = UpsertStats(store_slug=store_slug)
    _log = log or logger
    
    conn, store_id, currency = await _connect_and_get_store_id(store_slug)
    
    try:
        async for batch in scrape_iter:
            stats.total_scraped += len(batch)
            conn = await _upsert_batch_with_retry(
                store_slug, store_id, batch, stats, conn, log, currency=currency
            )
            _log.info(
                "[%s] batch done — scraped=%d upserted=%d price_changes=%d",
                store_slug, stats.total_scraped, stats.upserted, stats.price_changes,
            )
    finally:
        if conn and not conn.closed:
            await conn.close()

    stats.log_summary()
    return stats


_GAME_PREFIX_RE = re.compile(
    r"^(warhammer\s+40[,.]?000\s*:?\s*|warhammer\s+40k\s*:?\s*|"
    r"age\s+of\s+sigmar\s*:?\s*|the\s+horus\s+heresy\s*:?\s*|"
    r"the\s+old\s+world\s*:?\s*|warhammer\s*:?\s*|"
    r"games\s+workshop\s*:?\s*|gw\s*:?\s*)",
    re.IGNORECASE,
)


def _name_similarity(db_name: str, scraped_name: str) -> float:
    """Fuzzy match between a DB product name and a retailer's product title.

    Strips common game-system prefixes before comparing so that
    "Warhammer 40K: Ork Nobz" correctly matches "Ork Nobz".
    Returns a ratio in [0, 1]; 1.0 = identical after normalization.
    """
    def normalize(s: str) -> str:
        s = _GAME_PREFIX_RE.sub("", s).lower()
        s = re.sub(r"[^\w\s]", " ", s)
        return " ".join(s.split())

    return SequenceMatcher(None, normalize(db_name), normalize(scraped_name)).ratio()


_NAME_SIMILARITY_THRESHOLD = 0.5

# XX-XX catalog code pattern (e.g. "48-75", "99-12-01")
_CATALOG_CODE_RE = re.compile(r"^\d{2,3}-\d{2,3}(-\d{2})?$")


def _is_catalog_code(identifier: str) -> bool:
    """Return True if identifier is an XX-XX catalog code, False if it's an 11-digit GW item number."""
    return bool(_CATALOG_CODE_RE.match(identifier))


# Map store currency → product RRP column name
_CURRENCY_RRP_COLUMN = {
    "USD": "gw_rrp_usd",
    "GBP": "gw_rrp_gbp",
    "EUR": "gw_rrp_eur",
    "AUD": "gw_rrp_aud",
    "CAD": "gw_rrp_cad",
}


async def _lookup_product(
    conn: psycopg.AsyncConnection,
    identifier: str,
    currency: str = "USD",
) -> tuple[str, Decimal, str] | None:
    """Look up a product by either gw_catalog_code (XX-XX) or gw_item_number (11-digit).

    Returns (product_id, gw_rrp, name) or None if not found.
    Uses the RRP column matching the store's currency, falling back to gw_rrp_usd.
    """
    if _is_catalog_code(identifier):
        col = "gw_catalog_code"
    else:
        col = "gw_item_number"

    rrp_col = _CURRENCY_RRP_COLUMN.get(currency, "gw_rrp_usd")

    # Column names are safe (hardcoded above), not user input
    row = await (
        await conn.execute(
            f"SELECT id, COALESCE({rrp_col}, gw_rrp_usd), name FROM products WHERE {col} = %s AND is_active = TRUE",
            (identifier,),
        )
    ).fetchone()
    return row  # type: ignore[return-value]


async def _upsert_one(
    conn: psycopg.AsyncConnection,
    store_slug: str,
    store_id: str,
    result: PriceResult,
    stats: UpsertStats,
    currency: str = "USD",
) -> None:
    # 2. Look up product by gw_catalog_code (XX-XX) or gw_item_number (11-digit)
    product_row = await _lookup_product(conn, result.gw_item_number, currency=currency)

    if product_row is None:
        # No match by item number/catalog code — try Claude
        if result.product_name:
            logger.info(
                "[%s] No DB match for %s (%r) — trying Claude",
                store_slug, result.gw_item_number, result.product_name,
            )
            match = await claude_match_product(
                conn, store_slug, result.gw_item_number, result.product_name,
            )
            if match.product_id and match.confidence >= 0.7:
                rrp_col = _CURRENCY_RRP_COLUMN.get(currency, "gw_rrp_usd")
                row = await (
                    await conn.execute(
                        f"SELECT id, COALESCE({rrp_col}, gw_rrp_usd), name FROM products WHERE id = %s AND is_active = TRUE",
                        (match.product_id,),
                    )
                ).fetchone()
                if row:
                    product_row = row
                    logger.info(
                        "[%s] Claude found match for %s: %r (%.0f%%)",
                        store_slug, result.gw_item_number, row[2],
                        match.confidence * 100,
                    )
                else:
                    stats.unmatched.append(result.gw_item_number)
                    return
            else:
                stats.unmatched.append(result.gw_item_number)
                return
        else:
            stats.unmatched.append(result.gw_item_number)
            return

    product_id: str = product_row[0]
    gw_rrp: Decimal = Decimal(str(product_row[1]))  # regional RRP (GBP/EUR/etc or USD)
    db_product_name: str = product_row[2]

    # Name-mismatch guard: if the retailer's product title is available and
    # doesn't resemble the catalog product name, try Claude matching instead
    # of blindly trusting the catalog code.
    if result.product_name:
        sim = _name_similarity(db_product_name, result.product_name)
        if sim < _NAME_SIMILARITY_THRESHOLD:
            logger.info(
                "[%s] Low similarity for %s: DB=%r vs scraped=%r (%.2f) — trying Claude",
                store_slug, result.gw_item_number, db_product_name, result.product_name, sim,
            )
            # Ask Claude to find the correct match
            match = await claude_match_product(
                conn, store_slug, result.gw_item_number, result.product_name,
            )
            if match.product_id and match.confidence >= 0.7:
                # Claude found a better match — use it
                product_id = match.product_id
                row = await (
                    await conn.execute(
                        f"SELECT COALESCE({_CURRENCY_RRP_COLUMN.get(currency, 'gw_rrp_usd')}, gw_rrp_usd), name FROM products WHERE id = %s",
                        (product_id,),
                    )
                ).fetchone()
                if row:
                    gw_rrp = Decimal(str(row[0]))
                    db_product_name = row[1]
                    logger.info(
                        "[%s] Claude matched %r → %r (%.0f%%: %s)",
                        store_slug, result.product_name, db_product_name,
                        match.confidence * 100, match.reason,
                    )
                else:
                    stats.unmatched.append(f"{result.gw_item_number}:claude_product_gone")
                    return
            else:
                logger.warning(
                    "[%s] Claude could not match %s: %r (reason: %s)",
                    store_slug, result.gw_item_number, result.product_name,
                    match.reason,
                )
                stats.unmatched.append(f"{result.gw_item_number}:name_mismatch")
                return
    stats.matched += 1

    # 3. Compute discount_pct (regional RRP is the source of truth)
    current_price = Decimal(str(result.current_price))
    if gw_rrp > 0:
        discount_pct = (gw_rrp - current_price) / gw_rrp * 100
    else:
        discount_pct = Decimal("0")
    discount_pct = discount_pct.quantize(Decimal("0.01"))

    # Price sanity check — extreme discounts likely indicate a catalog code mismatch.
    if gw_rrp > 0 and discount_pct > 85:
        currency_symbol = {"GBP": "£", "EUR": "€", "AUD": "A$", "CAD": "C$"}.get(currency, "$")
        logger.warning(
            "[%s] Extreme discount for %s (%s): %.0f%% off RRP (%s%.2f vs %s%.2f) — possible mismatch",
            store_slug, result.gw_item_number, db_product_name,
            discount_pct, currency_symbol, current_price, currency_symbol, gw_rrp,
        )

    in_stock = result.in_stock
    stock_status = result.stock_status.value  # str for psycopg

    # 4. Fetch existing listing BEFORE upsert so we can detect changes
    existing = await (
        await conn.execute(
            "SELECT id, current_price, stock_status FROM listings WHERE product_id = %s AND store_id = %s",
            (product_id, store_id),
        )
    ).fetchone()

    if existing is None:
        price_changed = True  # brand new listing — always record initial price
    else:
        prev_price = Decimal(str(existing[1]))
        prev_status: str = existing[2]
        price_changed = prev_price != current_price or prev_status != stock_status

    # 5. Upsert listing; get listing_id from RETURNING
    upsert_row = await (
        await conn.execute(
            """
            INSERT INTO listings (
                id, product_id, store_id,
                store_product_url, store_sku,
                current_price, discount_pct,
                in_stock, stock_status,
                affiliate_url, currency,
                last_scraped, last_checked_at
            )
            VALUES (
                gen_random_uuid(), %s, %s,
                %s, %s,
                %s, %s,
                %s, %s::\"StockStatus\",
                %s, %s,
                NOW(), NOW()
            )
            ON CONFLICT (product_id, store_id) DO UPDATE SET
                store_product_url  = EXCLUDED.store_product_url,
                store_sku          = EXCLUDED.store_sku,
                current_price      = EXCLUDED.current_price,
                discount_pct       = EXCLUDED.discount_pct,
                in_stock           = EXCLUDED.in_stock,
                stock_status       = EXCLUDED.stock_status,
                affiliate_url      = EXCLUDED.affiliate_url,
                currency           = EXCLUDED.currency,
                last_scraped       = NOW(),
                last_checked_at    = NOW()
            RETURNING id
            """,
            (
                product_id, store_id,
                result.store_product_url, result.store_sku,
                current_price, discount_pct,
                in_stock, stock_status,
                result.affiliate_url, currency,
            ),
        )
    ).fetchone()
    listing_id: str = upsert_row[0]  # type: ignore[index]
    stats.upserted += 1

    if price_changed:
        await conn.execute(
            """
            INSERT INTO price_history (id, listing_id, price, discount_pct, in_stock, scraped_at)
            VALUES (gen_random_uuid(), %s, %s, %s, %s, NOW())
            """,
            (listing_id, current_price, discount_pct, in_stock),
        )
        stats.price_changes += 1

    await conn.commit()
