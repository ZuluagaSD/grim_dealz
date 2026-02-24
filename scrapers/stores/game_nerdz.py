"""
GameNerdz scraper.

Strategy:
  1. Paginate BigCommerce product sitemap:
     GET /xmlsitemap.php?type=products&page=N until empty.
     Extracts all product URLs (~1 300 total across 26 pages).
  2. Fetch each product page concurrently with httpx — BigCommerce serves
     schema.org JSON-LD in static HTML (no Playwright needed).
  3. Filter: only keep products where JSON-LD `brand.name` == "Games Workshop".
  4. Extract from JSON-LD offers:
     - mpn  → GW item number (e.g. "48-75")
     - price → current price (USD)
     - availability → stock status via normalize_stock_status()

Affiliate program: ShareASale (pending approval — set AFFILIATE_GAME_NERDZ env var).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup

from scrapers.base_store import BaseStore, PriceResult, StockStatus, normalize_stock_status

logger = logging.getLogger(__name__)

_BASE = "https://www.gamenerdz.com"
_SITEMAP_BASE = f"{_BASE}/xmlsitemap.php"

_AFFILIATE_TAG = os.environ.get("AFFILIATE_GAME_NERDZ")

_CONCURRENCY = 6
_SLEEP = 0.4  # between product page fetches per semaphore slot
_SITEMAP_SLEEP = 0.5  # between sitemap page fetches

_GW_MPN_RE = re.compile(r"^\d{2}-\d{2}$")
_SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def _parse_availability(availability_url: str) -> StockStatus:
    """Convert schema.org availability URL to StockStatus.

    "https://schema.org/InStock" → in_stock
    "https://schema.org/OutOfStock" → out_of_stock
    etc.
    """
    raw = availability_url.split("/")[-1]  # "InStock", "OutOfStock", "PreOrder", …
    return normalize_stock_status(raw)


def _parse_product_page(html: str, url: str) -> PriceResult | None:
    """Parse a GameNerdz product page via schema.org JSON-LD."""
    soup = BeautifulSoup(html, "html.parser")

    # Find schema.org Product JSON-LD
    ld_tag = soup.find("script", type="application/ld+json")
    if ld_tag is None:
        return None

    try:
        data = json.loads(ld_tag.string or "")
    except (json.JSONDecodeError, TypeError):
        return None

    # Handle both single object and @graph array
    if isinstance(data, list):
        products = [d for d in data if d.get("@type") == "Product"]
        if not products:
            return None
        data = products[0]
    elif data.get("@type") != "Product":
        # Check @graph
        graph = data.get("@graph", [])
        products = [d for d in graph if d.get("@type") == "Product"]
        if not products:
            return None
        data = products[0]

    # Brand filter — only process Games Workshop products
    brand = data.get("brand") or {}
    brand_name = (brand.get("name") or "").strip()
    if brand_name.lower() != "games workshop":
        return None

    # MPN — GW item number
    mpn: str = (data.get("mpn") or "").strip()
    if not _GW_MPN_RE.match(mpn):
        return None

    # Offers
    offers = data.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}

    raw_price = offers.get("price") or ""
    try:
        current_price = float(str(raw_price).replace(",", ""))
    except (ValueError, TypeError):
        return None

    if current_price <= 0:
        return None

    availability_url: str = offers.get("availability") or ""
    stock_status = _parse_availability(availability_url) if availability_url else StockStatus.out_of_stock

    return PriceResult(
        gw_item_number=mpn,
        current_price=current_price,
        stock_status=stock_status,
        store_product_url=url,
        store_sku=data.get("sku"),
        affiliate_url=None,  # TODO: fill after ShareASale approval
    )


class GameNerdzScraper(BaseStore):
    store_slug = "gamenerdz"

    async def _fetch_sitemap_page(self, page: int) -> list[str]:
        """Fetch one product sitemap page, return list of product URLs."""
        url = f"{_SITEMAP_BASE}?type=products&page={page}"
        try:
            resp = await self.get(url)
            root = ET.fromstring(resp.text)
            urls = [
                elem.text
                for elem in root.findall(f".//{{{_SITEMAP_NS}}}loc")
                if elem.text and elem.text.startswith(_BASE)
            ]
            return urls
        except Exception as exc:
            logger.warning("[gamenerdz] Sitemap page %d error: %s", page, exc)
            return []

    async def _collect_product_urls(self) -> list[str]:
        """Paginate all sitemap pages and return all product URLs."""
        all_urls: list[str] = []
        page = 1

        while True:
            await asyncio.sleep(_SITEMAP_SLEEP)
            urls = await self._fetch_sitemap_page(page)
            if not urls:
                break
            all_urls.extend(urls)
            logger.debug("[gamenerdz] Sitemap page %d: %d URLs", page, len(urls))
            page += 1

        logger.info("[gamenerdz] %d product URLs from sitemap", len(all_urls))
        return all_urls

    async def scrape(self) -> list[PriceResult]:
        """Scrape all GW products from GameNerdz via sitemap + schema.org JSON-LD."""
        product_urls = await self._collect_product_urls()
        if not product_urls:
            return []

        semaphore = asyncio.Semaphore(_CONCURRENCY)
        results: list[PriceResult] = []
        errors = 0
        skipped = 0

        async def fetch_one(url: str) -> PriceResult | None:
            async with semaphore:
                await asyncio.sleep(_SLEEP)
                try:
                    resp = await self.get(url)
                    return _parse_product_page(resp.text, url)
                except Exception as exc:
                    logger.debug("[gamenerdz] %s — %s: %s", url, type(exc).__name__, exc)
                    return None

        for coro in asyncio.as_completed([fetch_one(u) for u in product_urls]):
            result = await coro
            if result is not None:
                results.append(result)
            elif result is None:
                # Could be non-GW product (filtered) or a real error — both are None
                skipped += 1

        in_stock_count = sum(1 for r in results if r.in_stock)
        logger.info(
            "[gamenerdz] Done: %d GW results (%d in stock), %d skipped/errored",
            len(results), in_stock_count, skipped,
        )
        return results
