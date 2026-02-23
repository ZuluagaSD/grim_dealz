"""
Miniature Market scraper.

Strategy:
  1. Parse MM sitemap index → find gzipped product sitemap URL
  2. Download + decompress sitemap → extract all gw-XX-XX.html product URLs
  3. Fetch each page concurrently (semaphore=8), parse static HTML:
     - Price:  <meta property="product:price:amount" content="XX.XX">
     - Stock:  buy button class "btn__out-stock" = out_of_stock, else in_stock
     - Item #: extracted from URL slug (gw-XX-XX.html → "XX-XX")

No Playwright needed — all data is in the static HTML response.
Affiliate program: ShareASale (pending approval — set AFFILIATE_MINIATURE_MARKET env var).
"""

from __future__ import annotations

import asyncio
import gzip
import logging
import os
import re
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup

from scrapers.base_store import BaseStore, PriceResult, StockStatus

logger = logging.getLogger(__name__)

_SITEMAP_INDEX = "https://www.miniaturemarket.com/sitemap.xml"
_SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"

# ShareASale affiliate deep link — fill after approval
# Format TBD; set AFFILIATE_MINIATURE_MARKET to ShareASale tracking tag
_AFFILIATE_TAG = os.environ.get("AFFILIATE_MINIATURE_MARKET")

# Fetch 8 pages concurrently; 0.4 s polite delay inside each semaphore slot
_CONCURRENCY = 8
_SLEEP = 0.4


def _extract_item_number(url: str) -> str | None:
    """Extract GW item number from a Miniature Market product URL.

    "https://www.miniaturemarket.com/gw-48-75.html" → "48-75"
    """
    m = re.search(r"/gw-(\d{2}-\d{2})\.html", url)
    return m.group(1) if m else None


def _parse_product_page(html: str, item_number: str, url: str) -> PriceResult | None:
    """Parse a MM product page and return a PriceResult, or None on failure."""
    soup = BeautifulSoup(html, "html.parser")

    # Price ─ <meta property="product:price:amount" content="XX.XX">
    price_tag = soup.find("meta", property="product:price:amount")
    if price_tag is None:
        logger.debug("[miniature-market] No price meta for %s", item_number)
        return None

    raw_price = price_tag.get("content") or ""
    try:
        current_price = float(raw_price)
    except (ValueError, TypeError):
        logger.warning("[miniature-market] Bad price %r for %s", raw_price, item_number)
        return None

    if current_price <= 0:
        return None

    # Stock ─ buy button class "btn__out-stock" when OOS; "product-detail-btn" when in stock
    buy_btn = soup.find(class_=re.compile(r"\bbtn-buy\b"))
    if buy_btn and "btn__out-stock" in (buy_btn.get("class") or []):
        stock_status = StockStatus.out_of_stock
    else:
        stock_status = StockStatus.in_stock

    # Affiliate URL ─ placeholder until ShareASale approval
    affiliate_url: str | None = None

    return PriceResult(
        gw_item_number=item_number,
        current_price=current_price,
        stock_status=stock_status,
        store_product_url=url,
        affiliate_url=affiliate_url,
    )


class MiniatureMarketScraper(BaseStore):
    store_slug = "miniature-market"

    async def _fetch_product_urls(self) -> list[str]:
        """Return all GW product page URLs from the MM sitemap."""
        # 1. Sitemap index → find the .xml.gz child sitemap
        resp = await self.get(_SITEMAP_INDEX)
        root = ET.fromstring(resp.text)

        gz_urls = [
            elem.text
            for elem in root.findall(f".//{{{_SITEMAP_NS}}}loc")
            if elem.text and elem.text.endswith(".xml.gz")
        ]
        if not gz_urls:
            logger.error("[miniature-market] No .xml.gz sitemap found in index")
            return []

        # 2. Download + decompress
        logger.info("[miniature-market] Fetching sitemap: %s", gz_urls[0])
        resp = await self.get(gz_urls[0])
        xml_bytes = gzip.decompress(resp.content)
        sitemap_root = ET.fromstring(xml_bytes)

        # 3. Filter for gw-XX-XX.html URLs
        urls = [
            elem.text
            for elem in sitemap_root.findall(f".//{{{_SITEMAP_NS}}}loc")
            if elem.text and re.search(r"/gw-\d{2}-\d{2}\.html$", elem.text)
        ]
        logger.info("[miniature-market] %d GW product URLs in sitemap", len(urls))
        return urls

    async def scrape(self) -> list[PriceResult]:
        """Scrape all GW products from Miniature Market via sitemap + static HTML."""
        product_urls = await self._fetch_product_urls()
        if not product_urls:
            return []

        semaphore = asyncio.Semaphore(_CONCURRENCY)
        results: list[PriceResult] = []
        errors = 0

        async def fetch_one(url: str) -> PriceResult | None:
            item_number = _extract_item_number(url)
            if item_number is None:
                return None
            async with semaphore:
                await asyncio.sleep(_SLEEP)
                try:
                    resp = await self.get(url)
                    return _parse_product_page(resp.text, item_number, url)
                except Exception as exc:
                    logger.debug(
                        "[miniature-market] %s — %s: %s",
                        item_number, type(exc).__name__, exc,
                    )
                    return None

        for coro in asyncio.as_completed([fetch_one(u) for u in product_urls]):
            result = await coro
            if result is not None:
                results.append(result)
            else:
                errors += 1

        in_stock_count = sum(1 for r in results if r.in_stock)
        logger.info(
            "[miniature-market] Done: %d results (%d in stock), %d errors/skipped",
            len(results), in_stock_count, errors,
        )
        return results
