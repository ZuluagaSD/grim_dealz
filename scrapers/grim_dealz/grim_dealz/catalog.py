"""
GW product catalog — fetch + parse from Algolia.

Games Workshop exposes their full product catalog via Algolia's public
search API. This module fetches all products using the browse endpoint
(cursor-based pagination), deduplicates by objectID, and parses each hit
into a RawProduct ready for DB upsert.

Data source:
  - Algolia app: M5ZIQZNQ2H (public, search-only)
  - Index: prod-lazarus-product-en-us
  - ~16 paginated requests, <5 seconds total
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# Algolia config (public search-only credentials)
# ─────────────────────────────────────────

ALGOLIA_APP_ID = "M5ZIQZNQ2H"
ALGOLIA_API_KEY = "92c6a8254f9d34362df8e6d96475e5d8"
ALGOLIA_INDEX = "prod-lazarus-product-en-us"

GW_BASE_URL = "https://www.games-workshop.com"

# ─────────────────────────────────────────
# Skip / mapping constants
# ─────────────────────────────────────────

# Products with these raw Algolia productType values are excluded
SKIP_PRODUCT_TYPES = frozenset({
    "gift cards",
    "gift vouchers",
    "event tickets",
    "subscriptions",
})

# Map Algolia productType → our internal product_type
PRODUCT_TYPE_MAP = {
    "miniatures": "miniature",
    "miniature": "miniature",
    "paint": "paint",
    "paints": "paint",
    "spray": "paint",
    "tools and accessories": "accessory",
    "tools & accessories": "accessory",
    "tools": "accessory",
    "gaming accessories": "accessory",
    "accessories": "accessory",
    "bases": "accessory",
    "dice": "accessory",
    "books": "book",
    "novels": "book",
    "terrain": "terrain",
    "scenery": "terrain",
    "box sets": "box_set",
    "gaming essentials": "accessory",
}

# Warhammer 40K umbrella faction terms — not real factions
WH40K_UMBRELLA_TERMS = frozenset({
    "xenos",
    "imperium",
    "chaos",
    "unaligned",
    "generic",
})

# Faction-level terms that indicate non-product categories
SKIP_FACTION_TERMS = frozenset({
    "event exclusive",
    "licensed products",
})

# ─────────────────────────────────────────
# RawProduct dataclass
# ─────────────────────────────────────────

_GW_ITEM_NUMBER_RE = re.compile(r"\b(\d{11})\b")
_SLUG_CLEAN_RE = re.compile(r"[^\w\s-]")
_SLUG_SEP_RE = re.compile(r"[-\s]+")


@dataclass
class RawProduct:
    """Parsed GW product ready for DB upsert."""

    gw_item_number: str  # 11-digit GW item number (unique key)
    name: str
    slug: str
    game_system: str | None
    faction: str | None
    product_type: str | None
    gw_rrp_usd: float
    image_url: str | None
    gw_url: str | None


# ─────────────────────────────────────────
# Parsing helpers
# ─────────────────────────────────────────


def _slugify(name: str) -> str:
    """Generate URL-friendly slug from product name."""
    s = _SLUG_CLEAN_RE.sub("", name.lower())
    return _SLUG_SEP_RE.sub("-", s).strip("-")


def _extract_gw_item_number(hit: dict) -> str | None:
    """Extract 11-digit GW item number from the SKU field."""
    sku = hit.get("sku", "")
    if isinstance(sku, list):
        sku = " ".join(str(s) for s in sku)
    m = _GW_ITEM_NUMBER_RE.search(str(sku))
    return m.group(1) if m else None


def _extract_game_system_faction(hit: dict) -> tuple[str | None, str | None]:
    """Parse game system and faction from Algolia's GameSystemsRoot hierarchy.

    GameSystemsRoot.lvl0: ["Warhammer 40,000"]
    GameSystemsRoot.lvl1: ["Warhammer 40,000 > Space Marines"]
    GameSystemsRoot.lvl2: ["Warhammer 40,000 > Space Marines > Ultramarines"]
    """
    gs = hit.get("GameSystemsRoot")
    if not isinstance(gs, dict):
        return None, None

    game_system = None
    faction = None

    lvl0 = gs.get("lvl0", [])
    if lvl0:
        val = lvl0[0] if isinstance(lvl0, list) else lvl0
        game_system = str(val).strip()

    lvl1 = gs.get("lvl1", [])
    if lvl1:
        val = lvl1[0] if isinstance(lvl1, list) else lvl1
        parts = str(val).split(" > ")
        if len(parts) >= 2:
            raw_faction = parts[1].strip()
            if raw_faction.lower() not in SKIP_FACTION_TERMS | WH40K_UMBRELLA_TERMS:
                faction = raw_faction

    return game_system, faction


def _extract_product_type(hit: dict, name: str) -> str | None:
    """Map Algolia productType to our internal type, with name-based overrides."""
    raw = hit.get("productType", "")
    if isinstance(raw, list):
        raw = raw[0] if raw else ""
    raw = str(raw).strip().lower()

    mapped = PRODUCT_TYPE_MAP.get(raw)
    if mapped:
        return mapped

    # Name-based overrides
    name_lower = name.lower()
    if any(t in name_lower for t in ("combat patrol", "battleforce", "army set")):
        return "box_set"
    if any(t in name_lower for t in ("codex", "battletome", "army book")):
        return "book"

    return raw or None


def _extract_price(hit: dict) -> float | None:
    """Extract USD price from Algolia hit. Handles both flat and nested formats."""
    price = hit.get("price")
    if price is None:
        return None
    if isinstance(price, dict):
        price = price.get("amount") or price.get("value")
    try:
        p = float(price)
        return p if p > 0 else None
    except (ValueError, TypeError):
        return None


def _extract_image_url(hit: dict) -> str | None:
    """Extract product image URL, resolving relative paths against GW domain."""
    for key in ("primaryImage", "imageUrl", "image", "image_url"):
        val = hit.get(key)
        if val:
            url = str(val)
            if not url.startswith("http"):
                url = f"{GW_BASE_URL}{url}"
            return url
    return None


def _extract_gw_url(hit: dict) -> str | None:
    """Extract GW product page URL, resolving relative paths."""
    url = hit.get("url")
    if not url:
        return None
    url = str(url)
    if not url.startswith("http"):
        url = f"{GW_BASE_URL}{url}"
    return url


def algolia_hit_to_raw_product(hit: dict) -> RawProduct | None:
    """Convert an Algolia hit to a RawProduct, or None if invalid/skippable."""
    name = hit.get("name") or hit.get("title", "")
    if not name:
        return None
    name = str(name).strip()

    # Skip non-product types
    raw_type = hit.get("productType", "")
    if isinstance(raw_type, list):
        raw_type = raw_type[0] if raw_type else ""
    if str(raw_type).strip().lower() in SKIP_PRODUCT_TYPES:
        return None

    gw_item_number = _extract_gw_item_number(hit)
    if not gw_item_number:
        return None

    price = _extract_price(hit)
    if price is None:
        return None

    game_system, faction = _extract_game_system_faction(hit)
    product_type = _extract_product_type(hit, name)

    return RawProduct(
        gw_item_number=gw_item_number,
        name=name,
        slug=_slugify(name),
        game_system=game_system,
        faction=faction,
        product_type=product_type,
        gw_rrp_usd=price,
        image_url=_extract_image_url(hit),
        gw_url=_extract_gw_url(hit),
    )


# ─────────────────────────────────────────
# Algolia fetch — search all products
# ─────────────────────────────────────────

# Algolia search/query caps at 1000 results per query (paginatedTotal).
# We partition by GameSystemsRoot.lvl0 facet so each bucket stays under 1000,
# plus one catch-all query for products with no game system tag.
_GAME_SYSTEM_FACETS = [
    "Warhammer 40,000",
    "Age of Sigmar",
    "The Horus Heresy",
    "The Old World",
    "Middle-Earth",
    "Other Games",
]


async def fetch_all_algolia_products(log=None) -> list[dict]:
    """Fetch all GW products from Algolia using the search API.

    The browse endpoint is restricted (403), so we use /query with
    facet filters to partition results into buckets < 1000 each.
    Deduplicates by objectID across all buckets.
    """
    _log = log or logger
    seen: dict[str, dict] = {}

    headers = {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_API_KEY,
        "Content-Type": "application/json",
    }
    query_url = (
        f"https://{ALGOLIA_APP_ID}-dsn.algolia.net"
        f"/1/indexes/{ALGOLIA_INDEX}/query"
    )

    # Build filter list: one per game system + one NOT filter for uncategorised
    filters: list[str] = [
        f"GameSystemsRoot.lvl0:\"{gs}\"" for gs in _GAME_SYSTEM_FACETS
    ]
    not_clause = " AND ".join(
        f"NOT GameSystemsRoot.lvl0:\"{gs}\"" for gs in _GAME_SYSTEM_FACETS
    )
    filters.append(not_clause)

    async with httpx.AsyncClient(timeout=30.0) as client:
        for facet_filter in filters:
            page = 0
            while True:
                body = {
                    "params": f"hitsPerPage=1000&query=&page={page}",
                    "filters": facet_filter,
                }
                resp = await client.post(query_url, headers=headers, json=body)
                resp.raise_for_status()
                data = resp.json()

                hits = data.get("hits", [])
                for hit in hits:
                    seen[hit["objectID"]] = hit

                _log.info(
                    "Algolia [%s] page %d: %d hits (total unique: %d)",
                    facet_filter[:40],
                    page,
                    len(hits),
                    len(seen),
                )

                page += 1
                nb_pages = data.get("nbPages", 0)
                if page >= nb_pages or not hits:
                    break

    _log.info("Algolia fetch complete: %d unique products", len(seen))
    return list(seen.values())
