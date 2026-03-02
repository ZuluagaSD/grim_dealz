"""
Element Games scraper (UK).

Strategy:
  1. Crawl GW category pages on elementgames.co.uk to discover all product and
     subcategory URLs.  Category pages list these in static HTML.
  2. Fetch every discovered URL concurrently (semaphore=8) and try to parse it
     as a product page.  Subcategory pages silently fail the GW-code check and
     are skipped — no wasted phase needed to distinguish them from products.
  3. Parse static HTML for:
     - GW item number: "SKU / Product Code: 99070101056" → "99070101056"
       This is GW's 11-digit item number, matched via products.gw_item_number in DB.
     - Price: discounted price in GBP (£XX.XX)
     - Stock: stock text ("In Stock", "Out of Stock", etc.)
     - Product name: page heading

No Playwright needed — all data is in the static HTML response.
Affiliate program: Awin (~7% commission — set AFFILIATE_ELEMENT_GAMES env var).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from collections.abc import AsyncIterator
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from ..base_store import BaseStore, PriceResult, StockStatus

logger = logging.getLogger(__name__)

_BASE = "https://elementgames.co.uk"

_AFFILIATE_TAG = os.environ.get("AFFILIATE_ELEMENT_GAMES")

_CONCURRENCY = 4
_SLEEP = 0.5  # polite delay between product page fetches
_429_MAX_RETRIES = 3
_CATEGORY_SLEEP = 0.5  # polite delay between category page fetches
_BATCH_SIZE = 50

# GW's 11-digit item number pattern (e.g. "99070101056", "99120101442")
_GW_ITEM_RE = re.compile(r"\b(99\d{9})\b")

# Price extraction: £XX.XX
_PRICE_RE = re.compile(r"£(\d+(?:\.\d{2})?)")

# Stock status keywords found in Element Games product pages
_STOCK_PATTERNS: list[tuple[re.Pattern[str], StockStatus]] = [
    (re.compile(r"in\s*stock", re.IGNORECASE), StockStatus.in_stock),
    (re.compile(r"dispatch\s+due:\s*today", re.IGNORECASE), StockStatus.in_stock),
    (re.compile(r"pre[- ]?order", re.IGNORECASE), StockStatus.pre_order),
    (re.compile(r"stock\s+due", re.IGNORECASE), StockStatus.backorder),
    (re.compile(r"on\s+the\s+way", re.IGNORECASE), StockStatus.backorder),
    (re.compile(r"out\s+of\s+stock", re.IGNORECASE), StockStatus.out_of_stock),
    (re.compile(r"no\s+longer", re.IGNORECASE), StockStatus.out_of_stock),
    (re.compile(r"unavailable", re.IGNORECASE), StockStatus.out_of_stock),
    (re.compile(r"sold\s+out", re.IGNORECASE), StockStatus.out_of_stock),
]

# Top-level GW game system category paths to crawl.
# Verified against elementgames.co.uk/games-workshop (Feb 2026).
# Faction subcategories are discovered dynamically from each page.
_GW_CATEGORIES = [
    "/games-workshop/warhammer-40k",
    "/games-workshop/new-warhammer-age-of-sigmar",
    "/games-workshop/horus-heresy-miniatures",
    "/games-workshop/warhammer-the-old-world",
    "/games-workshop/legions-imperialis",
    "/games-workshop/warhammer-40k/necromunda",
    "/games-workshop/blood-bowl",
    "/games-workshop/warhammer-underworlds",
    "/games-workshop/MESBG",
]


def _resolve_url(href: str, base_url: str) -> str | None:
    """Resolve a potentially relative href against a base URL.

    Returns an absolute URL under _BASE, or None if the URL is external.
    """
    if not href or href.startswith(("javascript:", "mailto:", "#")):
        return None
    full = urljoin(base_url, href)
    # Only keep URLs on elementgames.co.uk
    if not full.startswith(_BASE):
        return None
    return full.split("?")[0].rstrip("/")


def _parse_stock_status(page_text: str) -> StockStatus:
    """Extract stock status from the product page text."""
    for pattern, status in _STOCK_PATTERNS:
        if pattern.search(page_text):
            return status
    return StockStatus.out_of_stock


def _extract_gw_code(soup: BeautifulSoup) -> str | None:
    """Extract the 11-digit GW item number from 'SKU / Product Code: XXXXXXXXXXX'."""
    page_text = soup.get_text()
    m = _GW_ITEM_RE.search(page_text)
    return m.group(1) if m else None


def _extract_price(soup: BeautifulSoup) -> float | None:
    """Extract the current (discounted) price in GBP.

    Element Games shows prices as "£27.00 £22.96 (save 15%)".
    The last £XX.XX before "(save" is the sale price.
    If only one price is shown, that's the current price.
    """
    page_text = soup.get_text()
    prices = _PRICE_RE.findall(page_text)
    if not prices:
        return None

    # If there are multiple prices near each other (RRP + sale), take the lower one
    # Typically the second price is the discounted one
    parsed = [float(p) for p in prices if float(p) > 0]
    if not parsed:
        return None

    # The discounted (current) price is the lowest positive price found in the
    # product info area. Filter out very small prices (shipping thresholds etc.)
    # by requiring at least £1.
    valid = [p for p in parsed if p >= 1.0]
    return min(valid) if valid else None


def _extract_product_name(soup: BeautifulSoup) -> str | None:
    """Extract product name from the page heading."""
    for tag_name in ("h1", "h2", "h3", "h4"):
        heading = soup.find(tag_name)
        if heading:
            name = heading.get_text(strip=True)
            if name and len(name) > 2:
                return name
    return None


def _parse_product_page(html: str, url: str) -> PriceResult | None:
    """Parse an Element Games product page and return a PriceResult."""
    soup = BeautifulSoup(html, "html.parser")

    gw_code = _extract_gw_code(soup)
    if not gw_code:
        logger.debug("[element-games] No GW code found on %s", url)
        return None

    current_price = _extract_price(soup)
    if current_price is None or current_price <= 0:
        logger.debug("[element-games] No valid price on %s", url)
        return None

    page_text = soup.get_text()
    stock_status = _parse_stock_status(page_text)
    product_name = _extract_product_name(soup)

    affiliate_url: str | None = None
    if _AFFILIATE_TAG:
        # Awin deep link format
        affiliate_url = (
            f"https://www.awin1.com/cread.php?awinmid=XXXXX"
            f"&awinaffid={_AFFILIATE_TAG}&ued={url}"
        )

    return PriceResult(
        gw_item_number=gw_code,
        current_price=current_price,
        stock_status=stock_status,
        product_name=product_name,
        store_product_url=url,
        affiliate_url=affiliate_url,
    )


class ElementGamesScraper(BaseStore):
    store_slug = "element-games"

    async def _discover_candidate_urls(self) -> list[str]:
        """Discover all candidate product/subcategory URLs from GW category pages.

        Category pages list links in static HTML — a mix of subcategory pages
        (factions) and individual product pages.  We collect them all and let
        the product parser filter out non-product pages by GW code presence.
        """
        candidates: set[str] = set()
        category_urls: set[str] = set()

        for cat_path in _GW_CATEGORIES:
            url = f"{_BASE}{cat_path}"
            category_urls.add(url)
            await asyncio.sleep(_CATEGORY_SLEEP)
            try:
                resp = await self.get(url)
                soup = BeautifulSoup(resp.text, "html.parser")
                for a_tag in soup.find_all("a", href=True):
                    href: str = a_tag["href"]
                    full_url = _resolve_url(href, url)
                    if not full_url:
                        continue
                    if "/games-workshop/" in full_url and full_url != url:
                        candidates.add(full_url)
            except Exception as exc:
                logger.warning("[element-games] Error fetching category %s: %s", url, exc)

        # Remove the top-level category URLs themselves — they aren't product pages
        candidates -= category_urls

        logger.info("[element-games] Discovered %d candidate URLs", len(candidates))
        return sorted(candidates)

    async def scrape(self) -> AsyncIterator[list[PriceResult]]:
        """Scrape GW products from Element Games, yielding batches as they arrive."""
        # Phase 1: discover candidate URLs from category pages
        logger.info("[element-games] Phase 1: discovering URLs from category pages...")
        candidate_urls = await self._discover_candidate_urls()

        if not candidate_urls:
            logger.warning("[element-games] No candidate URLs found")
            return

        # Phase 2: fetch each URL concurrently and try to parse as product page.
        # Subcategory pages will fail the GW code check and be silently skipped.
        logger.info("[element-games] Phase 2: fetching %d pages...", len(candidate_urls))
        semaphore = asyncio.Semaphore(_CONCURRENCY)
        total_results = 0

        async def fetch_one(url: str) -> PriceResult | None:
            async with semaphore:
                await asyncio.sleep(_SLEEP)
                for attempt in range(_429_MAX_RETRIES):
                    try:
                        resp = await self.get(url)
                        return _parse_product_page(resp.text, url)
                    except httpx.HTTPStatusError as exc:
                        if exc.response.status_code == 429 and attempt < _429_MAX_RETRIES - 1:
                            wait = 2 ** (attempt + 1)
                            logger.debug("[element-games] 429 on %s, waiting %ds", url, wait)
                            await asyncio.sleep(wait)
                            continue
                        logger.debug("[element-games] %s — %s: %s", url, type(exc).__name__, exc)
                        return None
                    except Exception as exc:
                        logger.debug("[element-games] %s — %s: %s", url, type(exc).__name__, exc)
                        return None
                return None

        batch: list[PriceResult] = []
        seen_codes: set[str] = set()
        for coro in asyncio.as_completed([fetch_one(u) for u in candidate_urls]):
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

        logger.info("[element-games] Done: %d unique GW results", total_results)
