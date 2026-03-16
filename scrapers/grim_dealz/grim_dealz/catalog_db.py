"""
GW catalog DB sync — upsert products + deactivate stale entries.

Orchestrates the full catalog sync:
  1. Fetch all products from Algolia (via catalog.py)
  2. Parse into RawProduct instances
  3. Upsert each product into the products table
  4. Deactivate products not seen in this sync run

Uses the same DIRECT_URL connection string as the store scrapers.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

import psycopg
from dotenv import load_dotenv

from .catalog import (
    RawProduct,
    algolia_hit_to_raw_product,
    fetch_all_algolia_products,
    fetch_regional_prices,
)

load_dotenv()

logger = logging.getLogger(__name__)


def _get_dsn() -> str:
    dsn = os.environ.get("DIRECT_URL")
    if not dsn:
        raise RuntimeError("DIRECT_URL environment variable is required")
    return dsn


@dataclass
class CatalogStats:
    total_algolia_hits: int = 0
    parsed: int = 0
    inserted: int = 0
    updated: int = 0
    deactivated: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


async def upsert_catalog_product(
    conn: psycopg.AsyncConnection, product: RawProduct
) -> bool:
    """Upsert a product into the products table.

    Returns True if inserted (new), False if updated (existing).
    Uses Postgres xmax = 0 trick to detect INSERT vs UPDATE.
    """
    row = await (
        await conn.execute(
            """
            INSERT INTO products (
                id, slug, name, gw_item_number, faction, game_system,
                category, product_type, gw_rrp_usd, gw_rrp_gbp, gw_rrp_eur,
                gw_rrp_aud, gw_rrp_cad, image_url, gw_url,
                description, is_active, created_at, updated_at
            )
            VALUES (
                gen_random_uuid(), %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, TRUE, NOW(), NOW()
            )
            ON CONFLICT (gw_item_number) DO UPDATE SET
                name = EXCLUDED.name,
                faction = EXCLUDED.faction,
                game_system = EXCLUDED.game_system,
                product_type = EXCLUDED.product_type,
                gw_rrp_usd = EXCLUDED.gw_rrp_usd,
                gw_rrp_gbp = COALESCE(EXCLUDED.gw_rrp_gbp, products.gw_rrp_gbp),
                gw_rrp_eur = COALESCE(EXCLUDED.gw_rrp_eur, products.gw_rrp_eur),
                gw_rrp_aud = COALESCE(EXCLUDED.gw_rrp_aud, products.gw_rrp_aud),
                gw_rrp_cad = COALESCE(EXCLUDED.gw_rrp_cad, products.gw_rrp_cad),
                image_url = EXCLUDED.image_url,
                gw_url = EXCLUDED.gw_url,
                description = COALESCE(EXCLUDED.description, products.description),
                is_active = TRUE,
                updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
            """,
            (
                product.slug,
                product.name,
                product.gw_item_number,
                product.faction,
                product.game_system,
                product.game_system or product.product_type or "other",  # category fallback
                product.product_type,
                product.gw_rrp_usd,
                product.gw_rrp_gbp,
                product.gw_rrp_eur,
                product.gw_rrp_aud,
                product.gw_rrp_cad,
                product.image_url,
                product.gw_url,
                product.description,
            ),
        )
    ).fetchone()
    await conn.commit()
    return row[0]  # type: ignore[index]


async def deactivate_unseen_products(
    conn: psycopg.AsyncConnection, sync_start_time: datetime
) -> int:
    """Deactivate products whose updated_at wasn't bumped during this sync.

    Products not seen in the Algolia response are presumed discontinued.
    Returns count of deactivated products.
    """
    result = await conn.execute(
        """
        UPDATE products
        SET is_active = FALSE, updated_at = NOW()
        WHERE updated_at < %s
          AND is_active = TRUE
        """,
        (sync_start_time,),
    )
    await conn.commit()
    return result.rowcount


async def sync_gw_catalog(log=None) -> CatalogStats:
    """Full catalog sync: fetch from Algolia, upsert to DB, deactivate unseen."""
    _log = log or logger
    stats = CatalogStats()
    sync_start = datetime.now(timezone.utc)

    # 1. Fetch all Algolia hits
    _log.info("Fetching GW product catalog from Algolia...")
    all_hits = await fetch_all_algolia_products(log=_log)
    stats.total_algolia_hits = len(all_hits)
    _log.info("Fetched %d Algolia hits", stats.total_algolia_hits)

    # 2. Fetch regional prices (GBP, EUR, AUD, CAD) in parallel
    _log.info("Fetching regional prices...")
    regional_prices = await fetch_regional_prices(log=_log)

    # 3. Parse into RawProducts and merge regional prices
    products: list[RawProduct] = []
    for hit in all_hits:
        try:
            product = algolia_hit_to_raw_product(hit)
            if product:
                # Merge regional prices by objectID
                oid = hit.get("objectID", "")
                if oid in regional_prices:
                    rp = regional_prices[oid]
                    product.gw_rrp_gbp = rp.get("gw_rrp_gbp")
                    product.gw_rrp_eur = rp.get("gw_rrp_eur")
                    product.gw_rrp_aud = rp.get("gw_rrp_aud")
                    product.gw_rrp_cad = rp.get("gw_rrp_cad")
                products.append(product)
            else:
                stats.skipped += 1
        except Exception as exc:
            stats.errors.append(f"parse error: {exc}")
            stats.skipped += 1
    stats.parsed = len(products)
    _log.info("Parsed %d products (%d skipped)", stats.parsed, stats.skipped)

    # 3. Connect and upsert each product
    conn = await psycopg.AsyncConnection.connect(_get_dsn())
    try:
        for i, product in enumerate(products):
            try:
                inserted = await upsert_catalog_product(conn, product)
                if inserted:
                    stats.inserted += 1
                else:
                    stats.updated += 1
            except Exception as exc:
                await conn.rollback()
                stats.errors.append(f"{product.gw_item_number}: {exc}")
                _log.warning("Error upserting %s: %s", product.gw_item_number, exc)

            if (i + 1) % 500 == 0:
                _log.info("Progress: %d/%d products upserted", i + 1, len(products))

        # 4. Deactivate products not seen in this sync
        stats.deactivated = await deactivate_unseen_products(conn, sync_start)
        _log.info("Deactivated %d unseen products", stats.deactivated)
    finally:
        await conn.close()

    _log.info(
        "Catalog sync complete: hits=%d parsed=%d inserted=%d updated=%d "
        "deactivated=%d skipped=%d errors=%d",
        stats.total_algolia_hits,
        stats.parsed,
        stats.inserted,
        stats.updated,
        stats.deactivated,
        stats.skipped,
        len(stats.errors),
    )
    return stats
