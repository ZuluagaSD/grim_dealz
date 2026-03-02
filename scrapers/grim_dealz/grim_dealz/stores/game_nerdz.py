"""
GameNerdz scraper.

Strategy:
  1. Fetch BigCommerce product sitemap (single page, ~5 400 URLs).
  2. Pre-filter URLs by GW keyword substrings — reduces candidates from
     ~5 400 → ~600 without any extra HTTP requests.
  3. Fetch each candidate page concurrently (semaphore=10); parse JSON-LD.
  4. Final filter: brand.name == "Games Workshop" AND mpn matches \\d{2}-\\d{2}.
  5. Yield results in batches of 50 as they arrive.

Affiliate program: ShareASale (pending approval — set AFFILIATE_GAME_NERDZ env var).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup

from ..base_store import BaseStore, PriceResult, StockStatus, normalize_stock_status

logger = logging.getLogger(__name__)

_BASE = "https://www.gamenerdz.com"
_SITEMAP_BASE = f"{_BASE}/xmlsitemap.php"

_AFFILIATE_TAG = os.environ.get("AFFILIATE_GAME_NERDZ")

_CONCURRENCY = 8  # reduced from 10 to ease memory pressure
_SLEEP = 0.25  # between product page fetches per semaphore slot
_SITEMAP_SLEEP = 0.3  # between sitemap page fetches

_GW_MPN_RE = re.compile(r"^\d{2}-\d{2}$")
_SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_BATCH_SIZE = 20  # reduced from 50 to ease memory/DB pressure

# URL substrings that identify likely GW products — pre-filters the sitemap
# from ~5 400 total URLs down to ~600, avoiding fetching irrelevant pages.
# The JSON-LD brand+MPN check still runs as the authoritative final filter.
_GW_URL_KEYWORDS = {
    "warhammer", "citadel", "space-marine", "necromunda", "blood-bowl",
    "horus-heresy", "kill-team", "warcry", "underworlds", "middle-earth",
    "adeptus", "genestealer", "necron", "stormcast", "nighthaunt",
    "skaven", "gloomspite", "kharadron", "idoneth", "sylvaneth",
    "drukhari", "tyranid", "thousand-sons", "death-guard", "world-eaters",
    "ossiarch", "soulblight", "seraphon", "lumineth", "fyreslayer",
}


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

    # Find all schema.org JSON-LD blocks and look for Product
    ld_tags = soup.find_all("script", type="application/ld+json")
    if not ld_tags:
        return None

    data = None
    for ld_tag in ld_tags:
        try:
            parsed = json.loads(ld_tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        # Handle both single object and @graph array
        if isinstance(parsed, list):
            products = [d for d in parsed if d.get("@type") == "Product"]
            if products:
                data = products[0]
                break
        elif parsed.get("@type") == "Product":
            data = parsed
            break
        else:
            # Check @graph
            graph = parsed.get("@graph", [])
            products = [d for d in graph if d.get("@type") == "Product"]
            if products:
                data = products[0]
                break

    if data is None:
        return None

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

    # Product name — used for catalog mismatch detection in db.py
    product_name: str | None = (data.get("name") or "").strip() or None

    return PriceResult(
        gw_item_number=mpn,
        current_price=current_price,
        stock_status=stock_status,
        product_name=product_name,
        store_product_url=url,
        store_sku=data.get("sku"),
        affiliate_url=None,  # TODO: fill after ShareASale approval
    )


class GameNerdzScraper(BaseStore):
    store_slug = "gamenerdz"

    async def _fetch_gw_product_urls(self) -> list[str]:
        """Return GW-candidate product URLs from the sitemap.

        Paginates until empty, then pre-filters by _GW_URL_KEYWORDS to avoid
        fetching thousands of irrelevant product pages.
        """
        all_urls: list[str] = []
        page = 1
        while True:
            await asyncio.sleep(_SITEMAP_SLEEP)
            url = f"{_SITEMAP_BASE}?type=products&page={page}"
            try:
                resp = await self.get(url)
                root = ET.fromstring(resp.text)
                page_urls = [
                    elem.text
                    for elem in root.findall(f".//{{{_SITEMAP_NS}}}loc")
                    if elem.text and elem.text.startswith(_BASE)
                ]
            except Exception as exc:
                logger.warning("[gamenerdz] Sitemap page %d error: %s", page, exc)
                break
            if not page_urls:
                break
            all_urls.extend(page_urls)
            page += 1

        # Pre-filter: only fetch pages whose URL contains a GW keyword
        gw_urls = [
            u for u in all_urls
            if any(kw in u.lower() for kw in _GW_URL_KEYWORDS)
        ]
        logger.info(
            "[gamenerdz] Sitemap: %d total URLs → %d GW candidates after keyword filter",
            len(all_urls), len(gw_urls),
        )
        return gw_urls

    async def scrape(self) -> AsyncIterator[list[PriceResult]]:
        """Scrape GW products from GameNerdz, yielding batches of ~50 as they arrive."""
        product_urls = await self._fetch_gw_product_urls()
        if not product_urls:
            return

        semaphore = asyncio.Semaphore(_CONCURRENCY)
        total_results = 0

        async def fetch_one(url: str) -> PriceResult | None:
            async with semaphore:
                await asyncio.sleep(_SLEEP)
                try:
                    resp = await self.get(url)
                    return _parse_product_page(resp.text, url)
                except Exception as exc:
                    logger.debug("[gamenerdz] %s — %s: %s", url, type(exc).__name__, exc)
                    return None

        batch: list[PriceResult] = []
        for coro in asyncio.as_completed([fetch_one(u) for u in product_urls]):
            result = await coro
            if result is not None:
                batch.append(result)
                if len(batch) >= _BATCH_SIZE:
                    total_results += len(batch)
                    yield batch
                    batch = []

        if batch:
            total_results += len(batch)
            yield batch

        logger.info("[gamenerdz] Done: %d GW results", total_results)
