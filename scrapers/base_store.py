"""
BaseStore — abstract base class for all GrimDealz store scrapers.

Each scraper subclass in scrapers/stores/ must implement:
  - `store_slug: str`        — matches stores.slug in DB
  - `scrape() -> list[PriceResult]`

Stock status normalization lives here — once, centrally — so all
scrapers produce identical enum values for the DB.

Usage:
    from scrapers.stores.miniature_market import MiniatureMarketScraper
    async with MiniatureMarketScraper() as scraper:
        results = await scraper.scrape()
"""

from __future__ import annotations

import abc
import logging
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# StockStatus enum — MUST match Prisma schema exactly
# Normalization map below maps raw retailer strings → these values
# ─────────────────────────────────────────


class StockStatus(StrEnum):
    in_stock = "in_stock"
    out_of_stock = "out_of_stock"
    backorder = "backorder"
    pre_order = "pre_order"
    limited = "limited"


# Normalize raw retailer strings → canonical StockStatus
# Add entries as new stores expose new status strings
_STOCK_NORMALIZATION: dict[str, StockStatus] = {
    # in_stock
    "in stock": StockStatus.in_stock,
    "in-stock": StockStatus.in_stock,
    "instock": StockStatus.in_stock,
    "available": StockStatus.in_stock,
    "add to cart": StockStatus.in_stock,
    "ships now": StockStatus.in_stock,
    "usually ships in 24 hours": StockStatus.in_stock,
    "usually ships in 1-3 business days": StockStatus.in_stock,
    # out_of_stock
    "out of stock": StockStatus.out_of_stock,
    "out-of-stock": StockStatus.out_of_stock,
    "outofstock": StockStatus.out_of_stock,
    "sold out": StockStatus.out_of_stock,
    "unavailable": StockStatus.out_of_stock,
    "not available": StockStatus.out_of_stock,
    # backorder
    "backorder": StockStatus.backorder,
    "back order": StockStatus.backorder,
    "on backorder": StockStatus.backorder,
    "backordered": StockStatus.backorder,
    # pre_order
    "pre-order": StockStatus.pre_order,
    "preorder": StockStatus.pre_order,
    "pre order": StockStatus.pre_order,
    "coming soon": StockStatus.pre_order,
    # limited
    "limited": StockStatus.limited,
    "low stock": StockStatus.limited,
    "limited availability": StockStatus.limited,
    "only a few left": StockStatus.limited,
}


def normalize_stock_status(raw: str) -> StockStatus:
    """Normalize a raw retailer stock string to a canonical StockStatus.

    Falls back to out_of_stock for unrecognized values (conservative —
    better to show "unavailable" than incorrectly show a price as buyable).
    Logs unrecognized values so the normalization map can be extended.
    """
    key = raw.strip().lower()
    status = _STOCK_NORMALIZATION.get(key)
    if status is None:
        logger.warning("Unknown stock status string: %r — defaulting to out_of_stock", raw)
        return StockStatus.out_of_stock
    return status


# ─────────────────────────────────────────
# PriceResult — scrapers produce these; db.py consumes them
# ─────────────────────────────────────────


@dataclass
class PriceResult:
    """Represents a single scraped product price from a store.

    gw_item_number is the deduplication key used to match against
    the products table (e.g. "48-75", "43-06").

    store_sku is optional — nice for debugging, not required for DB upsert.
    """

    gw_item_number: str            # e.g. "48-75"
    current_price: float           # USD, e.g. 42.50
    stock_status: StockStatus
    store_product_url: str | None = None
    store_sku: str | None = None
    affiliate_url: str | None = None    # pre-built affiliate deep link (optional)
    raw_data: dict[str, Any] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if self.current_price < 0:
            raise ValueError(f"Negative price: {self.current_price}")
        if not self.gw_item_number.strip():
            raise ValueError("gw_item_number cannot be empty")

    @property
    def in_stock(self) -> bool:
        return self.stock_status in (StockStatus.in_stock, StockStatus.limited)


# ─────────────────────────────────────────
# BaseStore — abstract scraper
# ─────────────────────────────────────────


class BaseStore(abc.ABC):
    """Abstract base class for all GrimDealz store scrapers.

    Provides:
    - httpx async client with reasonable timeouts
    - tenacity retry decorator for network calls
    - Context manager protocol (async with)

    Subclasses set `store_slug` and implement `scrape()`.
    """

    store_slug: str  # must match stores.slug in DB

    _DEFAULT_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; GrimDealzBot/1.0; "
            "+https://grimdealz.com/bot)"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "BaseStore":
        self._client = httpx.AsyncClient(
            headers=self._DEFAULT_HEADERS,
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
            http2=True,
        )
        return self

    async def __aexit__(self, *_: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Use 'async with' to initialise the scraper client")
        return self._client

    @retry(
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        reraise=True,
    )
    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        """GET with automatic retry on transient network errors."""
        response = await self.client.get(url, **kwargs)
        response.raise_for_status()
        return response

    @abc.abstractmethod
    async def scrape(self) -> list[PriceResult]:
        """Scrape all products from this store.

        Returns a list of PriceResult objects. gw_item_number on each result
        must be in the exact format used in the products table (e.g. "48-75").

        Callers (db.py) will silently skip results where gw_item_number
        does not match a row in products — log mismatches for debugging.
        """
        ...
