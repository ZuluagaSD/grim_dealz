"""
GrimDealz — run all active store scrapers.

Entry point for GitHub Actions cron job (every 4 hours).
After all scrapers complete, posts a revalidation webhook to Next.js
so ISR pages pick up fresh prices without a full rebuild.

Usage:
    python -m scrapers.run_all

    # Or via uv:
    uv run python -m scrapers.run_all
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

import httpx
from dotenv import load_dotenv

from .base_store import BaseStore
from .db import UpsertStats, stream_upsert

# Phase 1 scrapers — add new imports here as stores are implemented
from .stores.miniature_market import MiniatureMarketScraper
from .stores.discount_games_inc import DiscountGamesIncScraper
from .stores.frontline_gaming import FrontlineGamingScraper
from .stores.game_nerdz import GameNerdzScraper

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# All active scrapers — order doesn't matter, they run in parallel
SCRAPERS: list[type[BaseStore]] = [
    MiniatureMarketScraper,
    DiscountGamesIncScraper,
    FrontlineGamingScraper,
    GameNerdzScraper,
]

SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://www.grimdealz.com")
REVALIDATE_SECRET = os.environ.get("REVALIDATE_SECRET", "")


async def run_scraper(scraper_cls: type[BaseStore]) -> UpsertStats | None:
    """Run a single scraper, streaming results into the DB as each batch arrives."""
    name = scraper_cls.__name__
    try:
        async with scraper_cls() as scraper:
            logger.info("[%s] Starting scrape", name)
            stats = await stream_upsert(scraper.store_slug, scraper.scrape())
        return stats
    except Exception:
        logger.exception("[%s] Scraper failed", name)
        return None


async def post_revalidation_webhook(changed_stores: list[str]) -> None:
    """Tell Next.js to revalidate ISR cache after scraping."""
    if not REVALIDATE_SECRET:
        logger.warning("REVALIDATE_SECRET not set — skipping ISR revalidation webhook")
        return

    url = f"{SITE_URL}/api/revalidate"
    payload = {"secret": REVALIDATE_SECRET, "stores": changed_stores}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            logger.info("Revalidation webhook OK: %s", resp.json())
    except Exception:
        logger.exception("Revalidation webhook failed (non-fatal)")


async def main() -> int:
    """Run all scrapers in parallel, then fire the revalidation webhook.

    Returns exit code: 0 if all scrapers succeeded, 1 if any failed.
    """
    logger.info("=== GrimDealz scrape run starting (%d scrapers) ===", len(SCRAPERS))

    tasks = [run_scraper(cls) for cls in SCRAPERS]
    all_stats: list[UpsertStats | None] = await asyncio.gather(*tasks)

    # Collect which stores had changes (for targeted ISR revalidation)
    changed_stores: list[str] = []
    failed = 0
    for stats in all_stats:
        if stats is None:
            failed += 1
        elif stats.price_changes > 0 or stats.upserted > 0:
            changed_stores.append(stats.store_slug)

    # Fire revalidation webhook (non-fatal if it fails)
    await post_revalidation_webhook(changed_stores)

    total_matched = sum(s.matched for s in all_stats if s)
    total_changes = sum(s.price_changes for s in all_stats if s)
    logger.info(
        "=== Done. matched=%d price_changes=%d failed_scrapers=%d ===",
        total_matched,
        total_changes,
        failed,
    )

    return 1 if failed else 0


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    sys.exit(asyncio.run(main()))
