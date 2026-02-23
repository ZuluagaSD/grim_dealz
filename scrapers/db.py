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
    from scrapers.db import upsert_results
    stats = await upsert_results(store_slug="miniature-market", results=results)
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from decimal import Decimal

import psycopg
from dotenv import load_dotenv

from .base_store import PriceResult

load_dotenv()

logger = logging.getLogger(__name__)

# Use DIRECT_URL for writes — bypasses Supavisor transaction mode which
# doesn't support RETURNING or multi-statement transactions well for bulk upserts
_DSN = os.environ["DIRECT_URL"]


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


async def upsert_results(
    store_slug: str,
    results: list[PriceResult],
) -> UpsertStats:
    """Upsert a list of scraped PriceResults for one store.

    Steps per result:
    1. Look up store_id from store_slug
    2. Look up product_id + gw_rrp_usd from gw_item_number
    3. Compute discount_pct = (rrp - price) / rrp * 100
    4. Upsert listings ON CONFLICT(product_id, store_id)
    5. Write price_history only if price or stock_status changed
    """
    stats = UpsertStats(store_slug=store_slug, total_scraped=len(results))

    async with await psycopg.AsyncConnection.connect(_DSN) as conn:
        # 1. Resolve store_id once
        row = await conn.execute(
            "SELECT id FROM stores WHERE slug = %s AND is_active = TRUE",
            (store_slug,),
        )
        store_row = await row.fetchone()
        if store_row is None:
            raise ValueError(f"Store not found or inactive: {store_slug!r}")
        store_id: str = store_row[0]

        for result in results:
            try:
                await _upsert_one(conn, store_id, result, stats)
            except Exception as exc:
                msg = f"{result.gw_item_number}: {exc}"
                stats.errors.append(msg)
                logger.exception("[%s] Error upserting %s", store_slug, result.gw_item_number)

    stats.log_summary()
    return stats


async def _upsert_one(
    conn: psycopg.AsyncConnection,
    store_id: str,
    result: PriceResult,
    stats: UpsertStats,
) -> None:
    # 2. Look up product
    product_row = await (
        await conn.execute(
            "SELECT id, gw_rrp_usd FROM products WHERE gw_item_number = %s AND is_active = TRUE",
            (result.gw_item_number,),
        )
    ).fetchone()

    if product_row is None:
        stats.unmatched.append(result.gw_item_number)
        return

    product_id: str = product_row[0]
    gw_rrp_usd: Decimal = Decimal(str(product_row[1]))
    stats.matched += 1

    # 3. Compute discount_pct (products.gw_rrp_usd is the single source of truth)
    current_price = Decimal(str(result.current_price))
    if gw_rrp_usd > 0:
        discount_pct = (gw_rrp_usd - current_price) / gw_rrp_usd * 100
    else:
        discount_pct = Decimal("0")
    discount_pct = discount_pct.quantize(Decimal("0.01"))

    in_stock = result.in_stock
    stock_status = result.stock_status.value  # str for psycopg

    # 4. Upsert listing
    await conn.execute(
        """
        INSERT INTO listings (
            id, product_id, store_id,
            store_product_url, store_sku,
            current_price, discount_pct,
            in_stock, stock_status,
            affiliate_url,
            last_scraped, last_checked_at
        )
        VALUES (
            gen_random_uuid(), %s, %s,
            %s, %s,
            %s, %s,
            %s, %s::\"StockStatus\",
            %s,
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
            last_scraped       = NOW(),
            last_checked_at    = NOW()
        RETURNING id, current_price, stock_status
        """,
        (
            product_id, store_id,
            result.store_product_url, result.store_sku,
            current_price, discount_pct,
            in_stock, stock_status,
            result.affiliate_url,
        ),
    )
    stats.upserted += 1

    # 5. Fetch current listing state to check if price/stock changed
    existing = await (
        await conn.execute(
            """
            SELECT l.id, l.current_price, l.stock_status
            FROM   listings l
            WHERE  l.product_id = %s AND l.store_id = %s
            """,
            (product_id, store_id),
        )
    ).fetchone()

    if existing is None:
        # Brand new listing — always write first price_history row
        listing_id: str = existing[0] if existing else ""
        price_changed = True
    else:
        listing_id = existing[0]
        prev_price = Decimal(str(existing[1]))
        prev_status: str = existing[2]
        price_changed = prev_price != current_price or prev_status != stock_status

    if price_changed and listing_id:
        await conn.execute(
            """
            INSERT INTO price_history (id, listing_id, price, discount_pct, in_stock, scraped_at)
            VALUES (gen_random_uuid(), %s, %s, %s, %s, NOW())
            """,
            (listing_id, current_price, discount_pct, in_stock),
        )
        stats.price_changes += 1

    await conn.commit()
