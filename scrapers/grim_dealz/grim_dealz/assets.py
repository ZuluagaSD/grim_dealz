"""
Dagster assets for GrimDealz price scraping.

Each store is an independent asset that runs its scraper and upserts results
directly to Supabase. A downstream `revalidate_cache` asset fires the Next.js
ISR webhook once all stores have completed.

Required env vars:
  DIRECT_URL          — Supabase direct connection string (port 5432)
  REVALIDATE_SECRET   — Next.js ISR webhook secret
  NEXT_PUBLIC_SITE_URL — Next.js app URL (default: https://www.grimdealz.com)
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

import httpx
from dagster import asset

from .catalog_db import sync_gw_catalog
from .db import stream_upsert
from .enrich_catalog_codes import enrich_catalog_codes
from .stores.discount_games_inc import DiscountGamesIncScraper
from .stores.frontline_gaming import FrontlineGamingScraper
from .stores.game_nerdz import GameNerdzScraper
from .stores.miniature_market import MiniatureMarketScraper

logger = logging.getLogger(__name__)

_SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://www.grimdealz.com")
_REVALIDATE_SECRET = os.environ.get("REVALIDATE_SECRET", "")


def _run_async(coro):
    """Run an async coroutine synchronously. Sets SelectorEventLoop on Windows."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(coro)


@asset(group_name="grim_dealz")
def gw_product_catalog(context) -> dict:
    """Sync GW product catalog from Algolia. Upstream of all store scrapers."""
    stats = _run_async(sync_gw_catalog(log=context.log))
    context.add_output_metadata({
        "total_algolia_hits": stats.total_algolia_hits,
        "parsed": stats.parsed,
        "inserted": stats.inserted,
        "updated": stats.updated,
        "deactivated": stats.deactivated,
        "skipped": stats.skipped,
        "errors": len(stats.errors),
    })
    return {
        "total_algolia_hits": stats.total_algolia_hits,
        "parsed": stats.parsed,
        "inserted": stats.inserted,
        "updated": stats.updated,
        "deactivated": stats.deactivated,
        "skipped": stats.skipped,
        "errors": len(stats.errors),
    }


@asset(group_name="grim_dealz", deps=[gw_product_catalog])
def enrich_catalog_codes_asset(context) -> dict:
    """Populate products.gw_catalog_code via name-matching against MM and DGI."""
    dsn = os.environ["DIRECT_URL"]
    stats = _run_async(enrich_catalog_codes(dsn, log=context.log))
    context.add_output_metadata({
        "products_needing_codes": stats.products_needing_codes,
        "mm_matched": stats.mm_matched,
        "mm_attempted": stats.mm_attempted,
        "dgi_matched": stats.dgi_matched,
        "dgi_attempted": stats.dgi_attempted,
        "total_populated": stats.total_populated,
    })
    return {
        "products_needing_codes": stats.products_needing_codes,
        "mm_matched": stats.mm_matched,
        "mm_attempted": stats.mm_attempted,
        "dgi_matched": stats.dgi_matched,
        "dgi_attempted": stats.dgi_attempted,
        "total_populated": stats.total_populated,
    }


@asset(group_name="grim_dealz", deps=[enrich_catalog_codes_asset])
def miniature_market_listings(context) -> dict:
    """Scrape and upsert GW prices from Miniature Market."""
    async def _run():
        async with MiniatureMarketScraper() as scraper:
            return await stream_upsert(scraper.store_slug, scraper.scrape(), log=context.log)

    stats = _run_async(_run())
    context.add_output_metadata({
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    })
    return {
        "store_slug": stats.store_slug,
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    }


@asset(group_name="grim_dealz", deps=[enrich_catalog_codes_asset])
def discount_games_inc_listings(context) -> dict:
    """Scrape and upsert GW prices from Discount Games Inc."""
    async def _run():
        async with DiscountGamesIncScraper() as scraper:
            return await stream_upsert(scraper.store_slug, scraper.scrape(), log=context.log)

    stats = _run_async(_run())
    context.add_output_metadata({
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    })
    return {
        "store_slug": stats.store_slug,
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    }


@asset(group_name="grim_dealz", deps=[enrich_catalog_codes_asset])
def frontline_gaming_listings(context) -> dict:
    """Scrape and upsert GW prices from Frontline Gaming."""
    async def _run():
        async with FrontlineGamingScraper() as scraper:
            return await stream_upsert(scraper.store_slug, scraper.scrape(), log=context.log)

    stats = _run_async(_run())
    context.add_output_metadata({
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    })
    return {
        "store_slug": stats.store_slug,
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    }


@asset(group_name="grim_dealz", deps=[enrich_catalog_codes_asset])
def game_nerdz_listings(context) -> dict:
    """Scrape and upsert GW prices from GameNerdz."""
    async def _run():
        async with GameNerdzScraper() as scraper:
            return await stream_upsert(scraper.store_slug, scraper.scrape(), log=context.log)

    stats = _run_async(_run())
    context.add_output_metadata({
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    })
    return {
        "store_slug": stats.store_slug,
        "total_scraped": stats.total_scraped,
        "matched": stats.matched,
        "upserted": stats.upserted,
        "price_changes": stats.price_changes,
        "errors": len(stats.errors),
    }


@asset(group_name="grim_dealz")
def revalidate_cache(
    context,
    miniature_market_listings: dict,
    discount_games_inc_listings: dict,
    frontline_gaming_listings: dict,
    game_nerdz_listings: dict,
) -> None:
    """Post ISR revalidation webhook to Next.js after all stores are scraped.

    Only fires for stores that had price changes or new listings, so Next.js
    only rebuilds pages that actually changed.
    """
    if not _REVALIDATE_SECRET:
        context.log.warning("REVALIDATE_SECRET not set — skipping ISR revalidation webhook")
        return

    all_stats = [
        miniature_market_listings,
        discount_games_inc_listings,
        frontline_gaming_listings,
        game_nerdz_listings,
    ]
    changed_stores = [
        s["store_slug"] for s in all_stats
        if s.get("price_changes", 0) > 0 or s.get("upserted", 0) > 0
    ]

    if not changed_stores:
        context.log.info("No price changes detected — skipping revalidation webhook")
        return

    context.log.info("Revalidating ISR cache for stores: %s", changed_stores)

    async def _post():
        url = f"{_SITE_URL}/api/revalidate"
        headers = {"Authorization": f"Bearer {_REVALIDATE_SECRET}"}
        payload = {"tags": ["deals", "products"]}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    try:
        result = _run_async(_post())
        context.log.info("Revalidation webhook OK: %s", result)
    except Exception:
        # Non-fatal — prices are already in DB, just ISR won't refresh immediately
        context.log.exception("Revalidation webhook failed (non-fatal)")
