"""
GrimDealz — one-time GW catalog seed script.

Scrapes warhammer.com to build the canonical product list and writes
rows to the products table via direct DB connection.

Run ONCE to bootstrap the catalog. After that, products are updated
manually (new releases) or via a periodic refresh (not yet built).

Usage:
    uv run python -m scrapers.seed_catalog

Safety guards:
  - Skips products already in DB (ON CONFLICT DO NOTHING on gw_item_number)
  - Rate limit: ~3-5s between requests (DELAY_SECONDS)
  - Dry run: set DRY_RUN=1 to print without writing to DB

TODO (Week 2):
  - Map warhammer.com product categories → ProductType enum values
  - Handle pagination across all faction pages
  - Map faction names to canonical slugs (e.g. "Space Marines" → "space-marines")
  - Extract GW item numbers from product detail pages or catalogue PDFs
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import sys
import time
from dataclasses import dataclass

import psycopg
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
DELAY_SECONDS = float(os.environ.get("SEED_DELAY_SECONDS", "4"))
DSN = os.environ["DIRECT_URL"]

# GW item number pattern: two numbers separated by a hyphen, e.g. "48-75", "43-06-60"
GW_ITEM_NUMBER_RE = re.compile(r"\b\d{2,3}-\d{2,3}(?:-\d{2})?\b")

# Warhammer.com categories to ProductType mapping
# TODO: verify these URLs before running
CATEGORY_PAGES = [
    # (url, game_system, category, product_type)
    ("https://www.warhammer.com/en-US/shop/warhammer-40000/space-marines", "Warhammer 40000", "Space Marines", "standard"),
    # Add all faction/category pages here...
]


@dataclass
class CatalogProduct:
    name: str
    gw_item_number: str
    faction: str
    game_system: str
    category: str
    product_type: str  # matches ProductType enum
    gw_rrp_usd: float
    image_url: str | None
    slug: str


def _make_slug(name: str, gw_item_number: str) -> str:
    """Generate a stable URL slug from product name + item number.

    e.g. "Space Marines Intercessors (48-75)" → "space-marines-intercessors-48-75"
    Slug is generated once from item number — stable even if name changes.
    """
    normalized = name.lower()
    normalized = re.sub(r"[^a-z0-9\s-]", "", normalized)
    normalized = re.sub(r"\s+", "-", normalized.strip())
    normalized = re.sub(r"-+", "-", normalized)
    item_suffix = gw_item_number.replace(" ", "-")
    return f"{normalized}-{item_suffix}"[:200]


async def scrape_category(
    page: object,  # playwright Page
    url: str,
    game_system: str,
    category: str,
    product_type: str,
) -> list[CatalogProduct]:
    """Scrape one category page from warhammer.com.

    Implementation stub — selectors need to be verified against live site.
    """
    logger.info("Scraping: %s", url)
    # TODO Week 2: implement with Playwright
    # await page.goto(url)
    # await page.wait_for_selector(".product-list", timeout=10000)
    # products = await page.query_selector_all(".product-item")
    # ...
    return []


async def main() -> None:
    if DRY_RUN:
        logger.info("DRY RUN — no DB writes")

    products: list[CatalogProduct] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        for url, game_system, category, product_type in CATEGORY_PAGES:
            batch = await scrape_category(page, url, game_system, category, product_type)
            products.extend(batch)
            logger.info("  → found %d products", len(batch))
            await asyncio.sleep(DELAY_SECONDS)

        await browser.close()

    logger.info("Total products scraped: %d", len(products))

    if DRY_RUN or not products:
        for p in products[:5]:
            logger.info("  [DRY] %s (%s) — $%.2f", p.name, p.gw_item_number, p.gw_rrp_usd)
        return

    # Write to DB
    async with await psycopg.AsyncConnection.connect(DSN) as conn:
        inserted = 0
        for p in products:
            result = await conn.execute(
                """
                INSERT INTO products (
                    id, slug, name, gw_item_number,
                    faction, game_system, category, product_type,
                    gw_rrp_usd, image_url,
                    is_active, created_at, updated_at
                )
                VALUES (
                    gen_random_uuid(), %s, %s, %s,
                    %s, %s, %s, %s::\"ProductType\",
                    %s, %s,
                    TRUE, NOW(), NOW()
                )
                ON CONFLICT (gw_item_number) DO NOTHING
                RETURNING id
                """,
                (
                    p.slug, p.name, p.gw_item_number,
                    p.faction, p.game_system, p.category, p.product_type,
                    p.gw_rrp_usd, p.image_url,
                ),
            )
            if await result.fetchone():
                inserted += 1

        await conn.commit()

    logger.info("Inserted %d new products (skipped %d duplicates)", inserted, len(products) - inserted)


if __name__ == "__main__":
    asyncio.run(main())
