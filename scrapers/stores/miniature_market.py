"""
Miniature Market scraper — Phase 1 P0.

Miniature Market is one of the largest US GW retailers.
They discount ~20% off GW RRP by default.
Affiliate program: ShareASale.

TODO (Week 3):
  - Identify the product listing page URL pattern (e.g. site search by brand)
  - Map their stock status strings to StockStatus via normalize_stock_status()
  - Extract gw_item_number from product title or SKU (e.g. "48-75")
  - Build affiliate deep link format for affiliate_url field
"""

from __future__ import annotations

import logging

from scrapers.base_store import BaseStore, PriceResult, normalize_stock_status

logger = logging.getLogger(__name__)

# Affiliate link template — fill in after ShareASale approval
# Typically: https://www.shareasale.com/r.cfm?b=BANNER_ID&u=USER_ID&m=MERCHANT_ID&urllink=URL
_AFFILIATE_TAG: str | None = None  # set via env after approval

# Base URL for their Games Workshop product listing
_CATALOG_URL = "https://www.miniaturemarket.com/catalogsearch/result/?q=games+workshop&p={page}"


class MiniatureMarketScraper(BaseStore):
    store_slug = "miniature-market"

    async def scrape(self) -> list[PriceResult]:
        """Scrape all GW products from Miniature Market.

        Implementation stub — full implementation in Week 3.
        Returns empty list until selectors are built.
        """
        logger.warning(
            "[%s] Scraper not yet implemented — returning empty results",
            self.store_slug,
        )
        # TODO Week 3: paginate through catalog, extract products
        # Example skeleton:
        #
        # results = []
        # page = 1
        # while True:
        #     resp = await self.get(_CATALOG_URL.format(page=page))
        #     soup = BeautifulSoup(resp.text, "html.parser")
        #     items = soup.select(".product-item")
        #     if not items:
        #         break
        #     for item in items:
        #         gw_item_number = _extract_item_number(item)
        #         if not gw_item_number:
        #             continue
        #         price = float(item.select_one(".price").text.strip().replace("$", ""))
        #         raw_stock = item.select_one(".stock-status").text.strip()
        #         results.append(PriceResult(
        #             gw_item_number=gw_item_number,
        #             current_price=price,
        #             stock_status=normalize_stock_status(raw_stock),
        #             store_product_url=item.select_one("a")["href"],
        #         ))
        #     page += 1
        # return results
        return []
