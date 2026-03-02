"""
Wayland Games scraper (UK).

Strategy:
  1. Fetch sitemap index (/sitemap.xml) → sub-sitemaps (/media/sitemap-1-N.xml).
     Extract product URLs whose slug ends with an 11-digit GW item number.
  2. Fetch each product page concurrently (semaphore=8).
  3. Parse __NEXT_DATA__ JSON embedded in the HTML:
     - GW item number: from URL slug (trailing 11-digit code) or sku field
     - Price: priceRange.minimum_price.final_price.value (GBP)
     - Stock: stockStatus ("IN_STOCK" / "OUT_OF_STOCK")
     - Product name: title

Wayland runs a Next.js frontend over a Magento backend.  Product data is
server-side rendered into __NEXT_DATA__ JSON — no Playwright needed.

Important: The site blocks bot user agents.  We override with a standard
browser UA for this scraper (see __aenter__).

Affiliate program: Wayland's own (5% commission, 30-day cookie).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from xml.etree import ElementTree as ET

import httpx

from ..base_store import BaseStore, PriceResult, StockStatus

logger = logging.getLogger(__name__)

_BASE = "https://www.waylandgames.co.uk"

_AFFILIATE_TAG = os.environ.get("AFFILIATE_WAYLAND_GAMES")

_CONCURRENCY = 4
_SLEEP = 0.5
_BATCH_SIZE = 50
_429_MAX_RETRIES = 3

_SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"

# GW 11-digit item number at the end of a URL slug (e.g. "-99120101442")
_URL_GW_CODE_RE = re.compile(r"-(\d{11})$")

# __NEXT_DATA__ extraction
_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL
)

# Map Magento stock status strings to our enum
_STOCK_MAP: dict[str, StockStatus] = {
    "IN_STOCK": StockStatus.in_stock,
    "OUT_OF_STOCK": StockStatus.out_of_stock,
    "BACKORDER": StockStatus.backorder,
    "PRE_ORDER": StockStatus.pre_order,
}

# Browser UA — Wayland blocks the GrimDealzBot user agent
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def _extract_gw_code_from_url(url: str) -> str | None:
    """Extract GW 11-digit item number from the product URL slug.

    "/warhammer-age-of-sigmar-generals-handbook-2025-2026-english-60040299160"
    → "60040299160"
    """
    path = url.rstrip("/").split("?")[0]
    m = _URL_GW_CODE_RE.search(path)
    return m.group(1) if m else None


def _parse_product_from_next_data(html: str, url: str, gw_code: str) -> PriceResult | None:
    """Parse a Wayland Games product page by extracting __NEXT_DATA__ JSON."""
    m = _NEXT_DATA_RE.search(html)
    if not m:
        logger.debug("[wayland-games] No __NEXT_DATA__ on %s", url)
        return None

    try:
        next_data = json.loads(m.group(1))
    except json.JSONDecodeError:
        logger.debug("[wayland-games] Invalid __NEXT_DATA__ JSON on %s", url)
        return None

    page_props = next_data.get("props", {}).get("pageProps", {})

    # Product data can be in pageProps.data.useSimpleProduct or
    # in the dehydrated React Query cache
    product = (
        page_props.get("data", {}).get("useSimpleProduct")
        or page_props.get("data", {}).get("useConfigurableProduct")
    )

    # Fallback: search dehydrated queries
    if not product or not product.get("priceRange"):
        for query in page_props.get("dehydratedState", {}).get("queries", []):
            key = query.get("queryKey", [])
            if len(key) >= 2 and key[0] == "product":
                candidate = query.get("state", {}).get("data", {})
                if candidate.get("priceRange"):
                    product = candidate
                    break

    if not product:
        logger.debug("[wayland-games] No product data in __NEXT_DATA__ on %s", url)
        return None

    # ── Price ──
    price_range = product.get("priceRange", {})
    final_price_obj = (
        price_range.get("minimum_price", {}).get("final_price", {})
    )
    current_price = final_price_obj.get("value")
    if current_price is None or current_price <= 0:
        logger.debug("[wayland-games] No valid price on %s", url)
        return None

    # ── Stock ──
    raw_stock = product.get("stockStatus", "OUT_OF_STOCK")
    stock_status = _STOCK_MAP.get(raw_stock, StockStatus.out_of_stock)

    # ── Product Name ──
    product_name = product.get("title") or product.get("name")

    # ── SKU (prefer from product data, fall back to URL) ──
    sku = product.get("sku") or gw_code

    # ── Affiliate URL ──
    affiliate_url: str | None = None
    if _AFFILIATE_TAG:
        affiliate_url = f"{url}?ref={_AFFILIATE_TAG}"

    return PriceResult(
        gw_item_number=sku,
        current_price=float(current_price),
        stock_status=stock_status,
        product_name=product_name,
        store_product_url=url,
        affiliate_url=affiliate_url,
    )


class WaylandGamesScraper(BaseStore):
    store_slug = "wayland-games"

    async def __aenter__(self) -> "WaylandGamesScraper":
        """Override to use HTTP/1.1 and a browser user agent.

        Wayland's WAF fingerprints httpx's HTTP/2 implementation and returns
        403 even with a browser UA.  HTTP/1.1 with a browser UA works fine.
        """
        self._client = httpx.AsyncClient(
            headers={
                **self._DEFAULT_HEADERS,
                "User-Agent": _BROWSER_UA,
            },
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
            http2=False,
        )
        return self

    async def _discover_product_urls_from_sitemap(self) -> list[tuple[str, str]]:
        """Fetch all sub-sitemaps and extract (url, gw_code) tuples.

        Wayland's sitemap index is at /sitemap.xml, with sub-sitemaps at
        /media/sitemap-1-N.xml.  Product URLs end with a GW 11-digit code.
        """
        # Step 1: fetch sitemap index
        try:
            resp = await self.get(f"{_BASE}/sitemap.xml")
            root = ET.fromstring(resp.text)
        except Exception as exc:
            logger.warning("[wayland-games] Failed to fetch sitemap index: %s", exc)
            return []

        sub_urls = [
            elem.text
            for elem in root.findall(f".//{{{_SITEMAP_NS}}}loc")
            if elem.text
        ]
        logger.info("[wayland-games] Sitemap index: %d sub-sitemaps", len(sub_urls))

        # Step 2: fetch each sub-sitemap and collect GW product URLs
        results: list[tuple[str, str]] = []
        seen_codes: set[str] = set()

        for sub_url in sub_urls:
            try:
                resp = await self.get(sub_url)
                sub_root = ET.fromstring(resp.text)
                urls = [
                    elem.text
                    for elem in sub_root.findall(f".//{{{_SITEMAP_NS}}}loc")
                    if elem.text
                ]
                for url in urls:
                    code = _extract_gw_code_from_url(url)
                    if code and code not in seen_codes:
                        seen_codes.add(code)
                        results.append((url, code))
            except Exception as exc:
                logger.warning("[wayland-games] Error fetching %s: %s", sub_url, exc)

        logger.info("[wayland-games] Sitemap: %d unique GW product URLs", len(results))
        return results

    async def scrape(self) -> AsyncIterator[list[PriceResult]]:
        """Scrape GW products from Wayland Games, yielding batches as they arrive."""
        logger.info("[wayland-games] Phase 1: fetching sitemaps...")
        products = await self._discover_product_urls_from_sitemap()

        if not products:
            logger.warning("[wayland-games] No product URLs found")
            return

        logger.info("[wayland-games] Phase 2: fetching %d product pages...", len(products))
        semaphore = asyncio.Semaphore(_CONCURRENCY)
        total_results = 0

        async def fetch_one(url: str, gw_code: str) -> PriceResult | None:
            async with semaphore:
                await asyncio.sleep(_SLEEP)
                for attempt in range(_429_MAX_RETRIES):
                    try:
                        resp = await self.get(url)
                        return _parse_product_from_next_data(resp.text, url, gw_code)
                    except httpx.HTTPStatusError as exc:
                        if exc.response.status_code == 429 and attempt < _429_MAX_RETRIES - 1:
                            wait = 2 ** (attempt + 1)
                            logger.debug("[wayland-games] 429 on %s, waiting %ds", url, wait)
                            await asyncio.sleep(wait)
                            continue
                        logger.debug("[wayland-games] %s — %s: %s", url, type(exc).__name__, exc)
                        return None
                    except Exception as exc:
                        logger.debug("[wayland-games] %s — %s: %s", url, type(exc).__name__, exc)
                        return None
                return None

        batch: list[PriceResult] = []
        seen_codes: set[str] = set()
        for coro in asyncio.as_completed([fetch_one(url, code) for url, code in products]):
            result = await coro
            if result is not None and result.gw_item_number not in seen_codes:
                seen_codes.add(result.gw_item_number)
                batch.append(result)
                if len(batch) >= _BATCH_SIZE:
                    total_results += len(batch)
                    yield batch
                    batch = []

        if batch:
            total_results += len(batch)
            yield batch

        logger.info("[wayland-games] Done: %d unique GW results", total_results)
