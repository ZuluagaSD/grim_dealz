"""
Discount Games Inc scraper.

Strategy:
  1. Paginate all 13 GW subcategory pages, collect product URLs from data-url attributes
  2. Fetch each product page concurrently (semaphore=4), parse schema.org microdata:
     - GW item #: <meta itemprop="mpn" content="GAWXX-XX"> → strip "GAW" → "XX-XX"
     - Price:     <meta itemprop="price" content="XX.XX">
     - Stock:     <span class="in-stock"> or <span class="out-of-stock">
       Fallback:  <meta itemprop="availability" content="http://schema.org/InStock">

No Playwright needed — DGI serves complete schema.org microdata in static HTML.
Affiliate program: ShareASale (pending approval — set AFFILIATE_DISCOUNT_GAMES_INC env var).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re

from bs4 import BeautifulSoup

from scrapers.base_store import BaseStore, PriceResult, StockStatus

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.discountgamesinc.com"

# GW subcategory paths — paginated via page{n}.html suffix
_CATEGORIES = [
    "/miniatures-games/games-workshop/warhammer-40000/",
    "/miniatures-games/games-workshop/age-of-sigmar/",
    "/miniatures-games/games-workshop/kill-team/",
    "/miniatures-games/games-workshop/blood-bowl/",
    "/miniatures-games/games-workshop/necromunda/",
    "/miniatures-games/games-workshop/the-horus-heresy/",
    "/miniatures-games/games-workshop/the-old-world/",
    "/miniatures-games/games-workshop/warcry/",
    "/miniatures-games/games-workshop/underworlds/",
    "/miniatures-games/games-workshop/middle-earth/",
    "/miniatures-games/games-workshop/adeptus-titanicus/",
    "/miniatures-games/games-workshop/warhammer-quest/",
    "/paints-hobby-supplies/modeling-tools-accessories/games-workshop-citadel/",
]

_AFFILIATE_TAG = os.environ.get("AFFILIATE_DISCOUNT_GAMES_INC")

# Product page fetches: 4 concurrent, 0.5 s polite delay per slot
_CONCURRENCY = 4
_PRODUCT_SLEEP = 0.5
# Category pagination: 3 categories scraped concurrently; 0.5 s between page fetches per category
_CAT_CONCURRENCY = 3
_PAGE_SLEEP = 0.5


def _parse_item_number(mpn: str) -> str | None:
    """Extract GW item number from a DGI MPN value.

    "GAW49-51" → "49-51"   "GAW01-21" → "01-21"
    Returns None for non-GW MPNs (empty or missing GAW prefix).
    """
    mpn = mpn.strip().upper()
    if mpn.startswith("GAW"):
        candidate = mpn[3:]  # strip "GAW"
        if re.fullmatch(r"\d{2}-\d{2}", candidate):
            return candidate
    return None


def _parse_product_page(html: str, url: str) -> PriceResult | None:
    """Parse a DGI product page and return a PriceResult, or None on failure."""
    soup = BeautifulSoup(html, "html.parser")

    # GW item number from MPN
    mpn_tag = soup.find("meta", attrs={"itemprop": "mpn"})
    if mpn_tag is None:
        return None

    item_number = _parse_item_number(mpn_tag.get("content") or "")
    if item_number is None:
        return None

    # Price
    price_tag = soup.find("meta", attrs={"itemprop": "price"})
    if price_tag is None:
        return None

    raw_price = price_tag.get("content") or ""
    try:
        current_price = float(raw_price)
    except (ValueError, TypeError):
        return None

    if current_price <= 0:
        return None

    # Stock — prefer explicit span classes; fall back to schema.org availability
    if soup.find("span", class_="in-stock"):
        stock_status = StockStatus.in_stock
    elif soup.find("span", class_="out-of-stock"):
        stock_status = StockStatus.out_of_stock
    else:
        avail_tag = soup.find("meta", attrs={"itemprop": "availability"})
        avail_content = (avail_tag.get("content") or "") if avail_tag else ""
        if "InStock" in avail_content:
            stock_status = StockStatus.in_stock
        elif "PreOrder" in avail_content:
            stock_status = StockStatus.pre_order
        elif "BackOrder" in avail_content:
            stock_status = StockStatus.backorder
        else:
            stock_status = StockStatus.out_of_stock

    return PriceResult(
        gw_item_number=item_number,
        current_price=current_price,
        stock_status=stock_status,
        store_product_url=url,
        affiliate_url=None,  # TODO: fill after ShareASale approval
    )


class DiscountGamesIncScraper(BaseStore):
    store_slug = "discount-games-inc"

    async def _paginate_category(
        self, category_path: str, sem: asyncio.Semaphore
    ) -> set[str]:
        """Paginate one category, return all unique product URLs found.

        Stops when a page produces zero new URLs (DGI loops the last real page
        for any out-of-bounds page number, so empty-page detection isn't enough).
        """
        category_urls: set[str] = set()
        page = 1

        while True:
            url = (
                f"{_BASE_URL}{category_path}"
                if page == 1
                else f"{_BASE_URL}{category_path.rstrip('/')}/page{page}.html"
            )
            try:
                async with sem:
                    resp = await self.get(url)

                soup = BeautifulSoup(resp.text, "html.parser")
                page_urls = {
                    tag["data-url"]
                    for tag in soup.find_all(attrs={"data-url": True})
                    if "discountgamesinc.com/" in tag.get("data-url", "")
                }
                new = page_urls - category_urls
                if not new:
                    break  # no new products — reached end of real catalog

                category_urls.update(new)
                logger.debug(
                    "[discount-games-inc] %s p%d: +%d new (total %d)",
                    category_path, page, len(new), len(category_urls),
                )
                page += 1
                await asyncio.sleep(_PAGE_SLEEP)

            except Exception as exc:
                logger.warning(
                    "[discount-games-inc] Error fetching %s: %s", url, exc
                )
                break

        return category_urls

    async def _collect_product_urls(self) -> set[str]:
        """Collect all GW product URLs across all categories (parallel)."""
        sem = asyncio.Semaphore(_CAT_CONCURRENCY)
        per_cat = await asyncio.gather(
            *[self._paginate_category(path, sem) for path in _CATEGORIES]
        )
        collected = set().union(*per_cat)
        logger.info("[discount-games-inc] %d unique product URLs collected", len(collected))
        return collected

    async def scrape(self) -> list[PriceResult]:
        """Scrape all GW products from Discount Games Inc."""
        product_urls = await self._collect_product_urls()
        if not product_urls:
            return []

        semaphore = asyncio.Semaphore(_CONCURRENCY)
        results: list[PriceResult] = []
        errors = 0

        async def fetch_one(url: str) -> PriceResult | None:
            async with semaphore:
                await asyncio.sleep(_PRODUCT_SLEEP)
                try:
                    resp = await self.get(url)
                    return _parse_product_page(resp.text, url)
                except Exception as exc:
                    logger.debug(
                        "[discount-games-inc] %s — %s: %s",
                        url, type(exc).__name__, exc,
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
            "[discount-games-inc] Done: %d results (%d in stock), %d errors/skipped",
            len(results), in_stock_count, errors,
        )
        return results
