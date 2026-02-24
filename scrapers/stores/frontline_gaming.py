"""
Frontline Gaming scraper.

Strategy:
  1. Paginate Shopify collection API:
     GET /collections/games-workshop/products.json?limit=250&page=N
     until an empty `products` array is returned.
  2. Filter variants where vendor == "Games-Workshop".
  3. SKU on each variant IS the GW item number directly (e.g. "69-13").
     Skip variants whose SKU doesn't match \\d{2}-\\d{2}.
  4. Stock: variants[0].available (bool) → in_stock / out_of_stock.
     Tags containing "Pre-Order" (case-insensitive) → pre_order.

No Playwright needed — Shopify storefront JSON API returns complete data.
Affiliate program: Impact (pending approval — set AFFILIATE_FRONTLINE_GAMING env var).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from collections.abc import AsyncIterator

from scrapers.base_store import BaseStore, PriceResult, StockStatus

logger = logging.getLogger(__name__)

_BASE = "https://store.frontlinegaming.org"
_COLLECTION_URL = f"{_BASE}/collections/games-workshop/products.json"

_AFFILIATE_TAG = os.environ.get("AFFILIATE_FRONTLINE_GAMING")

_CONCURRENCY = 6
_SLEEP = 0.5

_GW_SKU_RE = re.compile(r"^\d{2}-\d{2}$")


def _stock_from_product(available: bool, tags: list[str]) -> StockStatus:
    """Derive StockStatus from Shopify available flag and product tags."""
    if not available:
        tags_lower = {t.lower() for t in tags}
        if "pre-order" in tags_lower or "preorder" in tags_lower:
            return StockStatus.pre_order
        return StockStatus.out_of_stock
    return StockStatus.in_stock


def _parse_product(product: dict) -> list[PriceResult]:
    """Return PriceResults for all valid GW variants in a Shopify product object."""
    results: list[PriceResult] = []
    tags: list[str] = product.get("tags", [])
    handle: str = product.get("handle", "")
    store_url = f"{_BASE}/products/{handle}" if handle else None

    for variant in product.get("variants", []):
        sku: str = (variant.get("sku") or "").strip()
        if not _GW_SKU_RE.match(sku):
            continue

        raw_price = variant.get("price") or ""
        try:
            current_price = float(raw_price)
        except (ValueError, TypeError):
            continue

        if current_price <= 0:
            continue

        available: bool = bool(variant.get("available", False))
        stock_status = _stock_from_product(available, tags)

        results.append(
            PriceResult(
                gw_item_number=sku,
                current_price=current_price,
                stock_status=stock_status,
                store_product_url=store_url,
                store_sku=sku,
                affiliate_url=None,  # TODO: fill after Impact approval
            )
        )

    return results


class FrontlineGamingScraper(BaseStore):
    store_slug = "frontline-gaming"

    async def _fetch_page(self, page: int) -> list[dict]:
        """Fetch one page of the GW collection. Returns empty list at end."""
        url = f"{_COLLECTION_URL}?limit=250&page={page}"
        try:
            resp = await self.get(url)
            return resp.json().get("products", [])
        except Exception as exc:
            logger.warning("[frontline-gaming] Page %d error: %s", page, exc)
            return []

    async def scrape(self) -> AsyncIterator[list[PriceResult]]:
        """Scrape GW products from Frontline Gaming, yielding one batch per API page."""
        page = 1
        total_results = 0

        while True:
            await asyncio.sleep(_SLEEP)
            products = await self._fetch_page(page)
            if not products:
                break

            batch = [r for p in products for r in _parse_product(p)]
            logger.debug(
                "[frontline-gaming] Page %d: %d products → %d results",
                page, len(products), len(batch),
            )
            if batch:
                total_results += len(batch)
                yield batch

            page += 1

        logger.info("[frontline-gaming] Done: %d results across %d pages", total_results, page - 1)
