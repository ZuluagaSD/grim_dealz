"""
Goblin Gaming scraper (UK).

Strategy:
  1. Paginate Shopify collection API:
     GET /collections/games-workshop/products.json?limit=250&page=N
  2. Filter by vendor == "Games Workshop".
  3. SKU is the 11-digit GW item number (e.g. "99120101309").
  4. Prices are in GBP (£).
  5. Stock: variants[0].available → in_stock / out_of_stock.
     Tags containing "Pre-Order" → pre_order.

No Playwright needed — Shopify storefront JSON API.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncIterator

from ..base_store import BaseStore, PriceResult, StockStatus

logger = logging.getLogger(__name__)

_BASE = "https://www.goblingaming.co.uk"
_COLLECTION_URL = f"{_BASE}/collections/games-workshop/products.json"

_CONCURRENCY = 8
_SLEEP = 0.3

# GW 11-digit item numbers (e.g. 99120101309) or catalog codes (e.g. 48-75)
_GW_SKU_RE = re.compile(r"^(\d{11}|\d{2,3}-\d{2,3}(-\d{2})?)$")


def _stock_from_product(available: bool, tags: list[str]) -> StockStatus:
    tags_lower = {t.lower() for t in tags}
    if not available:
        if "pre-order" in tags_lower or "preorder" in tags_lower:
            return StockStatus.pre_order
        return StockStatus.out_of_stock
    return StockStatus.in_stock


def _parse_product(product: dict) -> list[PriceResult]:
    results: list[PriceResult] = []
    tags: list[str] = product.get("tags", [])
    handle: str = product.get("handle", "")
    store_url = f"{_BASE}/products/{handle}" if handle else None

    # Only process Games Workshop products
    vendor = (product.get("vendor") or "").strip()
    if vendor.lower() != "games workshop":
        return []

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
        product_name: str | None = (product.get("title") or "").strip() or None

        results.append(
            PriceResult(
                gw_item_number=sku,
                current_price=current_price,
                stock_status=stock_status,
                product_name=product_name,
                store_product_url=store_url,
                store_sku=sku,
                affiliate_url=None,
            )
        )

    return results


class GoblinGamingScraper(BaseStore):
    store_slug = "goblin-gaming"

    async def _fetch_page(self, page: int) -> list[dict]:
        url = f"{_COLLECTION_URL}?limit=250&page={page}"
        try:
            resp = await self.get(url)
            return resp.json().get("products", [])
        except Exception as exc:
            logger.warning("[goblin-gaming] Page %d error: %s", page, exc)
            return []

    async def scrape(self) -> AsyncIterator[list[PriceResult]]:
        page = 1
        total_results = 0

        while True:
            await asyncio.sleep(_SLEEP)
            products = await self._fetch_page(page)
            if not products:
                break

            batch = [r for p in products for r in _parse_product(p)]
            logger.debug(
                "[goblin-gaming] Page %d: %d products → %d results",
                page, len(products), len(batch),
            )
            if batch:
                total_results += len(batch)
                yield batch

            page += 1

        logger.info("[goblin-gaming] Done: %d results across %d pages", total_results, page - 1)
