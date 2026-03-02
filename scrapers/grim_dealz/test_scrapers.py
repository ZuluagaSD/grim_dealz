"""
Local smoke-test for all GrimDealz scrapers.

Runs each scraper's scrape() method, collects results, and prints stats.
No DB connection needed — just tests HTTP fetching + parsing.

Usage:
    cd scrapers/grim_dealz
    python test_scrapers.py [store_slug ...]

    # Test all scrapers:
    python test_scrapers.py

    # Test specific ones:
    python test_scrapers.py element-games wayland-games
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time

from grim_dealz.base_store import BaseStore, PriceResult, StockStatus
from grim_dealz.stores.miniature_market import MiniatureMarketScraper
from grim_dealz.stores.discount_games_inc import DiscountGamesIncScraper
from grim_dealz.stores.frontline_gaming import FrontlineGamingScraper
from grim_dealz.stores.game_nerdz import GameNerdzScraper
from grim_dealz.stores.element_games import ElementGamesScraper
from grim_dealz.stores.wayland_games import WaylandGamesScraper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("test_scrapers")

ALL_SCRAPERS: dict[str, type[BaseStore]] = {
    "miniature-market": MiniatureMarketScraper,
    "discount-games-inc": DiscountGamesIncScraper,
    "frontline-gaming": FrontlineGamingScraper,
    "game-nerdz": GameNerdzScraper,
    "element-games": ElementGamesScraper,
    "wayland-games": WaylandGamesScraper,
}


async def test_one(slug: str, cls: type[BaseStore]) -> None:
    logger.info("=" * 60)
    logger.info("TESTING: %s (%s)", slug, cls.__name__)
    logger.info("=" * 60)

    results: list[PriceResult] = []
    t0 = time.monotonic()

    try:
        async with cls() as scraper:
            async for batch in scraper.scrape():
                results.extend(batch)
                logger.info(
                    "  ... batch +%d (total so far: %d)", len(batch), len(results)
                )
    except Exception:
        logger.exception("FAILED: %s", slug)
        return

    elapsed = time.monotonic() - t0

    # Stats
    in_stock = sum(1 for r in results if r.stock_status == StockStatus.in_stock)
    out_of_stock = sum(1 for r in results if r.stock_status == StockStatus.out_of_stock)
    pre_order = sum(1 for r in results if r.stock_status == StockStatus.pre_order)
    backorder = sum(1 for r in results if r.stock_status == StockStatus.backorder)
    limited = sum(1 for r in results if r.stock_status == StockStatus.limited)
    with_name = sum(1 for r in results if r.product_name)
    with_affiliate = sum(1 for r in results if r.affiliate_url)

    prices = [r.current_price for r in results if r.current_price > 0]
    min_price = min(prices) if prices else 0
    max_price = max(prices) if prices else 0
    avg_price = sum(prices) / len(prices) if prices else 0

    logger.info("")
    logger.info("RESULTS: %s", slug)
    logger.info("  Total results:  %d", len(results))
    logger.info("  Time:           %.1fs", elapsed)
    logger.info("  In stock:       %d", in_stock)
    logger.info("  Out of stock:   %d", out_of_stock)
    logger.info("  Pre-order:      %d", pre_order)
    logger.info("  Backorder:      %d", backorder)
    logger.info("  Limited:        %d", limited)
    logger.info("  With name:      %d", with_name)
    logger.info("  With affiliate: %d", with_affiliate)
    logger.info("  Price range:    %.2f – %.2f (avg %.2f)", min_price, max_price, avg_price)

    # Show a few sample results
    logger.info("  --- Sample results ---")
    for r in results[:5]:
        logger.info(
            "    %s | %7.2f | %-12s | %s | %s",
            r.gw_item_number,
            r.current_price,
            r.stock_status.value,
            r.product_name or "(no name)",
            r.store_product_url or "",
        )
    if len(results) > 5:
        logger.info("    ... and %d more", len(results) - 5)
    logger.info("")


async def main(slugs: list[str]) -> None:
    for slug in slugs:
        cls = ALL_SCRAPERS.get(slug)
        if cls is None:
            logger.error("Unknown scraper: %s (available: %s)", slug, ", ".join(ALL_SCRAPERS))
            continue
        await test_one(slug, cls)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    slugs = sys.argv[1:] if len(sys.argv) > 1 else list(ALL_SCRAPERS.keys())
    asyncio.run(main(slugs))
