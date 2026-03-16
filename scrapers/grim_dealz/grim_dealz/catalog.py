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

GW_BASE_URL = "https://www.warhammer.com"

# ─────────────────────────────────────────
# Skip / mapping constants
# ─────────────────────────────────────────

# Products with these raw Algolia productType values are excluded
SKIP_PRODUCT_TYPES = frozenset({
    "gift cards",
    "gift vouchers",
    "event tickets",
    "subscriptions",
    "virtualgiftvoucher",
    "digitalproduct",
    "blackdigitallibrary",
    "licensedproduct",
})

# Map Algolia productType → Prisma ProductType enum value.
# Algolia values are lowercased before lookup.
PRODUCT_TYPE_MAP = {
    # Miniatures (current: "miniatureKit", legacy: "miniatures"/"miniature")
    "miniaturekit": "miniature",
    "miniatures": "miniature",
    "miniature": "miniature",
    # Paint & brushes
    "paint": "paint",
    "paints": "paint",
    "spray": "paint",
    "brush": "paint",
    # Accessories
    "tools and accessories": "accessory",
    "tools & accessories": "accessory",
    "tools": "accessory",
    "gaming accessories": "accessory",
    "gamingaccessory": "accessory",
    "accessories": "accessory",
    "accessory": "accessory",
    "bases": "accessory",
    "base": "accessory",
    "dice": "accessory",
    "gaming essentials": "accessory",
    "proprietary": "accessory",
    # Books & rules
    "books": "book",
    "book": "book",
    "novels": "book",
    "rulebookcards": "book",
    "magazine": "book",
    # Terrain
    "terrain": "terrain",
    "scenery": "terrain",
    # Box sets
    "box sets": "box_set",
    "boxedset": "box_set",
    "bundle": "box_set",
}

# Warhammer 40K umbrella faction terms — not real factions
WH40K_UMBRELLA_TERMS = frozenset({
    "xenos",
    "imperium",
    "chaos",
    "unaligned",
    "generic",
})

# lvl1 terms that are NOT factions — these are unit role / navigation categories.
# When we encounter these, we dig into lvl2 for the real faction.
NON_FACTION_TERMS = frozenset({
    "unit type",
    "gaming rules",
    "scenery",
    "terrain",
    "start here",
    "ways to play",
    "gameplay accessories",
    "bases and accessories",
    "accessories",
    "rules",
    "rules & army books",
    "force organisation",
    "vehicles",
    "race",
})

# Umbrella groupings in lvl1 that contain real factions in lvl2
UMBRELLA_FACTION_TERMS = frozenset({
    "xenos armies",
    "armies of chaos",
    "armies of the imperium",
    "armies of the old world",
    "grand alliance order",
    "grand alliance chaos",
    "grand alliance death",
    "grand alliance destruction",
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
    description: str | None = None
    gw_rrp_gbp: float | None = None
    gw_rrp_eur: float | None = None
    gw_rrp_aud: float | None = None
    gw_rrp_cad: float | None = None


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

    Algolia provides multi-level categorisation:
      lvl0: ["Warhammer 40,000"]
      lvl1: ["Warhammer 40,000 > Unit Type", "Warhammer 40,000 > Xenos Armies"]
      lvl2: ["Warhammer 40,000 > Xenos Armies > Aeldari", ...]

    Strategy:
      1. Iterate all lvl1 entries to find the first real faction (not unit type/scenery/etc.)
      2. If lvl1 only has umbrella groupings (e.g. "Xenos Armies"), dig into lvl2 for the
         specific army (e.g. "Aeldari").
      3. If lvl1 only has non-faction terms (e.g. "Unit Type"), also dig into lvl2.
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

    lvl1_raw = gs.get("lvl1", [])
    if isinstance(lvl1_raw, str):
        lvl1_raw = [lvl1_raw]

    lvl2_raw = gs.get("lvl2", [])
    if isinstance(lvl2_raw, str):
        lvl2_raw = [lvl2_raw]

    # Pass 1: scan lvl1 for a direct faction (e.g. "Space Marines", "Necromunda")
    umbrella_found = None
    for val in lvl1_raw:
        parts = str(val).split(" > ")
        if len(parts) < 2:
            continue
        raw = parts[1].strip()
        raw_lower = raw.lower()

        if raw_lower in SKIP_FACTION_TERMS | WH40K_UMBRELLA_TERMS:
            continue
        if raw_lower in NON_FACTION_TERMS:
            continue
        if raw_lower in UMBRELLA_FACTION_TERMS:
            # Remember the umbrella — we'll dig into lvl2 for the real faction
            if not umbrella_found:
                umbrella_found = raw
            continue

        # This is a real faction (e.g. "Space Marines", "Thousand Sons", "Necromunda")
        faction = raw
        break

    # Pass 2: if no direct faction but we found an umbrella, dig into lvl2
    if not faction and umbrella_found:
        umbrella_lower = umbrella_found.lower()
        for val in lvl2_raw:
            parts = str(val).split(" > ")
            if len(parts) >= 3 and parts[1].strip().lower() == umbrella_lower:
                candidate = parts[2].strip()
                # Skip unit-role terms that appear in lvl2 (e.g. "Infantry", "Character")
                if candidate.lower() not in NON_FACTION_TERMS:
                    faction = candidate
                    break

    # Pass 3: if still no faction (only "Unit Type" in lvl1), try lvl2 under any umbrella
    if not faction:
        for val in lvl2_raw:
            parts = str(val).split(" > ")
            if len(parts) >= 3:
                mid = parts[1].strip().lower()
                if mid in UMBRELLA_FACTION_TERMS:
                    candidate = parts[2].strip()
                    if candidate.lower() not in NON_FACTION_TERMS:
                        faction = candidate
                        break

    return game_system, faction


def _extract_product_type(hit: dict, name: str) -> str | None:
    """Map Algolia productType to our internal type, with name-based overrides."""
    # Name-based overrides take priority (e.g. "Combat Patrol" boxedsets → combat_patrol)
    name_lower = name.lower()
    if "combat patrol" in name_lower:
        return "combat_patrol"
    if "battleforce" in name_lower:
        return "battleforce"
    if any(t in name_lower for t in ("codex", "battletome", "army book")):
        return "book"

    raw = hit.get("productType", "")
    if isinstance(raw, list):
        raw = raw[0] if raw else ""
    raw = str(raw).strip().lower()

    mapped = PRODUCT_TYPE_MAP.get(raw)
    if mapped:
        return mapped

    # Fallback to standard for unknown types (must be valid Prisma enum)
    return "standard"


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
    # Current format: "images" is a list of relative paths
    images = hit.get("images")
    if isinstance(images, list) and images:
        # Pick the first static image (920x950), skip threeSixty paths
        for img in images:
            img_str = str(img)
            if "threeSixty" not in img_str:
                if not img_str.startswith("http"):
                    img_str = f"{GW_BASE_URL}{img_str}"
                return img_str
        # Fallback to first image if all are threeSixty
        url = str(images[0])
        if not url.startswith("http"):
            url = f"{GW_BASE_URL}{url}"
        return url

    # Legacy field names
    for key in ("primaryImage", "imageUrl", "image", "image_url"):
        val = hit.get(key)
        if val:
            url = str(val)
            if not url.startswith("http"):
                url = f"{GW_BASE_URL}{url}"
            return url
    return None


def _extract_gw_url(hit: dict) -> str | None:
    """Extract GW product page URL from slug or url field."""
    # Current format: "slug" field (e.g. "Space-Marines-Primaris-Intercessors-2020")
    slug = hit.get("slug")
    if slug:
        return f"{GW_BASE_URL}/en-US/{slug}"

    # Legacy: full or relative "url" field
    url = hit.get("url")
    if not url:
        return None
    url = str(url)
    if not url.startswith("http"):
        url = f"{GW_BASE_URL}{url}"
    return url


def _extract_description(hit: dict) -> str | None:
    """Extract product description from Algolia hit, stripping HTML tags."""
    for key in ("shortDescription", "description", "longDescription"):
        val = hit.get(key)
        if val and isinstance(val, str):
            # Strip HTML tags — descriptions sometimes contain <p>, <br>, etc.
            text = re.sub(r"<[^>]+>", " ", val).strip()
            # Collapse whitespace
            text = re.sub(r"\s+", " ", text)
            if len(text) > 20:  # skip trivially short descriptions
                return text
    return None


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
        description=_extract_description(hit),
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


# ─────────────────────────────────────────
# Regional pricing — fetch GBP/EUR/AUD/CAD from other Algolia indices
# ─────────────────────────────────────────

_REGIONAL_INDICES = {
    "gw_rrp_gbp": "prod-lazarus-product-en-gb",
    "gw_rrp_eur": "prod-lazarus-product-en-eu",
    "gw_rrp_aud": "prod-lazarus-product-en-au",
    "gw_rrp_cad": "prod-lazarus-product-en-ca",
}


async def fetch_regional_prices(log=None) -> dict[str, dict[str, float]]:
    """Fetch prices from regional Algolia indices.

    Returns a dict keyed by objectID, with values like:
      {"gw_rrp_gbp": 40.0, "gw_rrp_eur": 51.5, "gw_rrp_aud": 110.0, "gw_rrp_cad": 78.0}
    """
    _log = log or logger
    # objectID → {field: price}
    prices: dict[str, dict[str, float]] = {}

    headers = {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_API_KEY,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for field_name, index_name in _REGIONAL_INDICES.items():
            query_url = (
                f"https://{ALGOLIA_APP_ID}-dsn.algolia.net"
                f"/1/indexes/{index_name}/query"
            )
            region_count = 0

            # Use same facet partition strategy as main fetch
            filters: list[str] = [
                f"GameSystemsRoot.lvl0:\"{gs}\"" for gs in _GAME_SYSTEM_FACETS
            ]
            not_clause = " AND ".join(
                f"NOT GameSystemsRoot.lvl0:\"{gs}\"" for gs in _GAME_SYSTEM_FACETS
            )
            filters.append(not_clause)

            for facet_filter in filters:
                page = 0
                while True:
                    body = {
                        "params": f"hitsPerPage=1000&query=&page={page}"
                                  f"&attributesToRetrieve=objectID,price,ctPrice",
                        "filters": facet_filter,
                    }
                    resp = await client.post(query_url, headers=headers, json=body)
                    resp.raise_for_status()
                    data = resp.json()
                    hits = data.get("hits", [])

                    for hit in hits:
                        oid = hit["objectID"]
                        price = hit.get("price")
                        if price is not None:
                            if oid not in prices:
                                prices[oid] = {}
                            prices[oid][field_name] = float(price)
                            region_count += 1

                    page += 1
                    if page >= data.get("nbPages", 0) or not hits:
                        break

            _log.info("Regional prices [%s]: %d products", field_name, region_count)

    _log.info("Regional price fetch complete: %d products with regional data", len(prices))
    return prices
