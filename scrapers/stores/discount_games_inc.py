"""
Discount Games Inc scraper — Phase 1 P0.

DGI is a major US GW retailer, ~20% off RRP.
Affiliate program: ShareASale.

TODO (Week 3):
  - Identify catalog URL structure for GW products
  - Map stock status strings via normalize_stock_status()
  - Extract gw_item_number from product data
  - Build ShareASale affiliate deep link format
"""

from __future__ import annotations

import logging

from scrapers.base_store import BaseStore, PriceResult, normalize_stock_status

logger = logging.getLogger(__name__)

_AFFILIATE_TAG: str | None = None  # set via env after ShareASale approval


class DiscountGamesIncScraper(BaseStore):
    store_slug = "discount-games-inc"

    async def scrape(self) -> list[PriceResult]:
        """Scrape all GW products from Discount Games Inc.

        Implementation stub — full implementation in Week 3.
        Returns empty list until selectors are built.
        """
        logger.warning(
            "[%s] Scraper not yet implemented — returning empty results",
            self.store_slug,
        )
        return []
