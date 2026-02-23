"""
GrimDealz — one-time GW product catalog seed.

Uses warhammer.com's public Algolia search index to fetch all US product data
without browser automation. The Algolia app ID and search-only API key are
embedded in warhammer.com's frontend JavaScript (visible in DevTools → Network).

If the API key ever expires, refresh it by:
  1. Open https://www.warhammer.com/en-US/shop/warhammer-40000 in a browser
  2. Open DevTools → Network → filter by "algolia"
  3. Copy the X-Algolia-Application-Id and X-Algolia-API-Key request headers

Usage:
  # Seed the full catalog (~3,700 products, takes ~30 seconds)
  uv run python seed_catalog.py

  # Dry run — no DB writes, logs extracted data
  DRY_RUN=1 uv run python seed_catalog.py

  # Resume — skip products already in DB
  RESUME=1 uv run python seed_catalog.py

  # Inspect a single product URL (uses browser, for debugging selectors)
  uv run python seed_catalog.py --inspect https://www.warhammer.com/en-US/shop/SLUG
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Any

import httpx
import psycopg
from bs4 import BeautifulSoup
from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows (crawl4ai uses rich with Unicode arrows)
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)

# ─────────────────────────────────────────
# Config
# ─────────────────────────────────────────

DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
RESUME = os.environ.get("RESUME", "").lower() in ("1", "true", "yes")
DSN = os.environ["DIRECT_URL"]

# Algolia credentials (public search-only key, embedded in warhammer.com frontend)
ALGOLIA_APP_ID = os.environ.get("ALGOLIA_APP_ID", "M5ZIQZNQ2H")
ALGOLIA_API_KEY = os.environ.get("ALGOLIA_API_KEY", "92c6a8254f9d34362df8e6d96475e5d8")
ALGOLIA_INDEX = "prod-lazarus-product-en-us"
ALGOLIA_BASE_URL = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes"

# Product types to skip (no physical GW miniature/book to compare)
SKIP_PRODUCT_TYPES = frozenset({
    "digitalProduct",
    "blackDigitalLibrary",
    "virtualGiftVoucher",
    "licensedProduct",
    "bundle",  # usually multi-item bundles with non-standard pricing
})

# Algolia productType → our ProductType enum
PRODUCT_TYPE_MAP: dict[str, str] = {
    "paint": "paint",
    "brush": "paint",
    "base": "paint",           # Citadel Colour bases/technical/shade pots
    "accessory": "standard",
    "gamingAccessory": "standard",
    "proprietary": "standard",
    "book": "codex",
    "rulebookCards": "codex",
    "magazine": "codex",
    "miniatureKit": "standard",
    "boxedSet": "standard",
}

# Override product type by name patterns (takes precedence over Algolia productType)
PRODUCT_TYPE_NAME_OVERRIDES: list[tuple[str, str]] = [
    ("battleforce", "battleforce"),
    ("combat patrol", "combat_patrol"),
    ("terrain", "terrain"),
    ("scenery", "terrain"),
    ("codex", "codex"),
    ("army book", "codex"),
    ("rulebook", "codex"),
]

# Non-faction category terms to skip when extracting faction from GameSystemsRoot
SKIP_FACTION_TERMS = frozenset({
    "unit type",
    "start here",
    "grand alliance order",
    "grand alliance chaos",
    "grand alliance death",
    "grand alliance destruction",
    "new releases",
    "collector's items",
    "specialist games",
    "gaming rules",    # codex/rulebook category — not a playable faction
    "gaming accessories",
})

# GW catalog number: 11-digit number (e.g. "99120101309")
GW_CATALOG_RE = re.compile(r"\b(\d{11})\b")


# ─────────────────────────────────────────
# Data types
# ─────────────────────────────────────────


@dataclass
class RawProduct:
    url: str
    name: str
    gw_item_number: str
    faction: str
    game_system: str
    category: str
    product_type: str
    gw_rrp_usd: float
    image_url: str | None
    slug: str
    raw_json_ld: dict[str, Any] = field(default_factory=dict, repr=False)


# ─────────────────────────────────────────
# Algolia seeding
# ─────────────────────────────────────────


async def fetch_all_algolia_products() -> list[dict[str, Any]]:
    """Fetch all products from Algolia using multiple targeted queries.

    Algolia public keys are limited to 1000 hits per query. We work around this
    by querying once per game system (each <1000 products) and once per non-miniature
    product type (paints, books, etc.), then deduplicating by objectID.
    """
    headers = {
        "X-Algolia-API-Key": ALGOLIA_API_KEY,
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "Content-Type": "application/json",
    }
    query_url = f"{ALGOLIA_BASE_URL}/{ALGOLIA_INDEX}/query"

    # Each sub-query returns <1000 results for the full 3,754-product catalog.
    # Game systems: WH40K=927, AoS=706, Other=581, Heresy=502, OldWorld=316, ME=307
    # Non-miniature types: paint=334, rulebookCards=197, book=108, etc.
    sub_queries = [
        # ── By game system (miniature kits) ──────────────────────────
        {"facetFilters": [["GameSystemsRoot.lvl0:Warhammer 40,000"]]},
        {"facetFilters": [["GameSystemsRoot.lvl0:Age of Sigmar"]]},
        {"facetFilters": [["GameSystemsRoot.lvl0:The Horus Heresy"]]},
        {"facetFilters": [["GameSystemsRoot.lvl0:Other Games"]]},
        {"facetFilters": [["GameSystemsRoot.lvl0:The Old World"]]},
        {"facetFilters": [["GameSystemsRoot.lvl0:Middle-Earth"]]},
        # ── By product type (paints / accessories / books not in a game system) ──
        {"facetFilters": [["productType:paint"]]},
        {"facetFilters": [["productType:brush"]]},
        {"facetFilters": [["productType:base"]]},
        {"facetFilters": [["productType:rulebookCards"]]},
        {"facetFilters": [["productType:book"]]},
        {"facetFilters": [["productType:accessory"]]},
        {"facetFilters": [["productType:gamingAccessory"]]},
        {"facetFilters": [["productType:magazine"]]},
        {"facetFilters": [["productType:boxedSet"]]},
        {"facetFilters": [["productType:proprietary"]]},
    ]

    all_hits: dict[str, dict[str, Any]] = {}  # objectID → hit (deduplicated)

    async with httpx.AsyncClient(headers=headers, timeout=30) as client:
        for query_body in sub_queries:
            resp = await client.post(
                query_url,
                json={"query": "", "hitsPerPage": 1000, "page": 0, **query_body},
            )
            resp.raise_for_status()
            data = resp.json()
            hits = data.get("hits", [])
            for hit in hits:
                oid = hit.get("objectID") or hit.get("id") or ""
                if oid:
                    all_hits[oid] = hit
            logger.info(
                "Query %s → %d hits (total unique: %d)",
                str(query_body.get("facetFilters", ["?"])[0])[:60],
                len(hits),
                len(all_hits),
            )

    return list(all_hits.values())


def _extract_game_system_faction(game_systems_root: dict[str, Any]) -> tuple[str, str]:
    """Extract game_system and faction from Algolia's GameSystemsRoot hierarchy.

    GameSystemsRoot structure:
      lvl0: ["Warhammer 40,000"]
      lvl1: ["Warhammer 40,000 > Space Marines", ...]
      lvl2: ["Warhammer 40,000 > Space Marines > Ultramarines", ...]

    WH40K/Heresy/etc.: faction is at lvl1 (e.g., "WH40K > Space Marines")
    AoS: faction is at lvl2 via Grand Alliance (e.g., "AoS > Grand Alliance Order > Stormcast")

    Returns (game_system, faction).
    """
    lvl0 = game_systems_root.get("lvl0") or []
    lvl1 = game_systems_root.get("lvl1") or []
    lvl2 = game_systems_root.get("lvl2") or []

    game_system = lvl0[0] if lvl0 else "Warhammer 40,000"
    faction = "Multi-faction"

    # Step 1: Try lvl1 first — works for WH40K, Horus Heresy, Old World, etc.
    # where the faction is at level 1 (e.g., "Warhammer 40,000 > Space Marines")
    for entry in lvl1:
        parts = [p.strip() for p in entry.split(">")]
        if len(parts) >= 2:
            candidate = parts[1]
            if candidate.lower() not in SKIP_FACTION_TERMS:
                faction = candidate
                break

    # Step 2: If still multi-faction, or only got a Grand Alliance umbrella (AoS pattern),
    # look deeper in lvl2 for the specific AoS faction
    if faction == "Multi-faction" or faction.lower().startswith("grand alliance"):
        for entry in lvl2:
            parts = [p.strip() for p in entry.split(">")]
            # AoS: "Age of Sigmar > Grand Alliance Order > Lumineth Realm-lords"
            # We want parts[2] when parts[1] is "Grand Alliance X"
            if len(parts) >= 3 and parts[1].lower().startswith("grand alliance"):
                candidate = parts[2]
                if candidate.lower() not in SKIP_FACTION_TERMS:
                    faction = candidate
                    break

    return game_system, faction


def _map_product_type(name: str, algolia_type: str) -> str:
    """Map Algolia productType + product name to our ProductType enum value."""
    name_lower = name.lower()
    for keyword, ptype in PRODUCT_TYPE_NAME_OVERRIDES:
        if keyword in name_lower:
            return ptype
    return PRODUCT_TYPE_MAP.get(algolia_type, "standard")


def algolia_hit_to_raw_product(hit: dict[str, Any]) -> RawProduct | None:
    """Convert an Algolia product record to RawProduct. Returns None to skip."""
    algolia_type = hit.get("productType", "miniatureKit") or "miniatureKit"
    if algolia_type in SKIP_PRODUCT_TYPES:
        return None

    # Extract 11-digit GW catalog number from SKU
    # Formats: "prod3560262-99120101309", "P-239658-99120299139"
    sku = str(hit.get("sku", "") or "")
    m = GW_CATALOG_RE.search(sku)
    if not m:
        return None
    gw_item_number = m.group(1)

    name = (hit.get("name") or "").strip()
    if not name:
        return None

    price = float(hit.get("price") or 0)
    if price <= 0:
        return None

    # Image URL
    images = hit.get("images") or []
    image_url: str | None = None
    if images:
        img = str(images[0])
        image_url = f"https://www.warhammer.com{img}" if img.startswith("/") else img

    # Game system and faction
    game_systems_root = hit.get("GameSystemsRoot") or {}
    game_system, faction = _extract_game_system_faction(game_systems_root)

    # Product type + category
    product_type = _map_product_type(name, algolia_type)
    category = _product_type_to_category(product_type)

    # Slug for our DB
    slug = _make_slug(name, gw_item_number)

    # warhammer.com URL
    wh_slug = hit.get("slug", "") or gw_item_number
    url = f"https://www.warhammer.com/en-US/shop/{wh_slug}"

    return RawProduct(
        url=url,
        name=name,
        gw_item_number=gw_item_number,
        faction=faction,
        game_system=game_system,
        category=category,
        product_type=product_type,
        gw_rrp_usd=price,
        image_url=image_url,
        slug=slug,
    )


def _product_type_to_category(product_type: str) -> str:
    return {
        "paint": "Paints",
        "codex": "Books",
        "terrain": "Terrain",
    }.get(product_type, "Miniatures")


# ─────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────


def _make_slug(name: str, gw_item_number: str) -> str:
    """Generate a stable, URL-safe slug: '{name}-{item-number}'.

    e.g. "Space Marines Intercessors" + "99120101309" → "space-marines-intercessors-99120101309"
    """
    normalized = name.lower()
    normalized = re.sub(r"[^a-z0-9\s-]", "", normalized)
    normalized = re.sub(r"\s+", "-", normalized.strip())
    normalized = re.sub(r"-+", "-", normalized)
    return f"{normalized}-{gw_item_number}"[:200]


# ─────────────────────────────────────────
# DB write
# ─────────────────────────────────────────


async def upsert_product(conn: psycopg.AsyncConnection, p: RawProduct) -> bool:
    """Insert product, skip if gw_item_number already exists. Returns True if inserted.

    ON CONFLICT updates gw_url so re-running this script backfills the URL for
    existing products that were seeded before the gw_url column existed.
    """
    result = await conn.execute(
        """
        INSERT INTO products (
            id, slug, name, gw_item_number,
            faction, game_system, category, product_type,
            gw_rrp_usd, image_url, gw_url,
            is_active, created_at, updated_at
        )
        VALUES (
            gen_random_uuid(), %s, %s, %s,
            %s, %s, %s, %s::"ProductType",
            %s, %s, %s,
            TRUE, NOW(), NOW()
        )
        ON CONFLICT (gw_item_number) DO UPDATE SET gw_url = EXCLUDED.gw_url
        RETURNING id
        """,
        (
            p.slug, p.name, p.gw_item_number,
            p.faction, p.game_system, p.category, p.product_type,
            p.gw_rrp_usd, p.image_url, p.url,
        ),
    )
    return await result.fetchone() is not None


# ─────────────────────────────────────────
# Inspect mode (browser-based, for debugging)
# ─────────────────────────────────────────

# ── JSON-LD extraction helpers ────────────────────────────────────────

GW_ITEM_NUMBER_RE = re.compile(r"\b(\d{2,3}-\d{2,3}(?:-\d{2,3})?(?:-\d{3})?)\b")


def _extract_item_number_from_text(text: str) -> str | None:
    labelled = re.search(
        r"(?:cat\s*no|product\s*code|item\s*(?:no|number)|catalog\s*(?:no|number))"
        r"[:\s]+([0-9]{2,3}-[0-9]{2,3}(?:-[0-9]{2,3})?)",
        text,
        re.IGNORECASE,
    )
    if labelled:
        return labelled.group(1).strip()
    return None


def _extract_item_number_from_json_ld(data: dict[str, Any]) -> str | None:
    for fname in ("mpn", "productID", "identifier"):
        val = data.get(fname)
        if val and isinstance(val, str):
            m = GW_ITEM_NUMBER_RE.search(val) or GW_CATALOG_RE.search(val)
            if m:
                return m.group(1)

    sku = str(data.get("sku", "") or "")
    if sku:
        cleaned = re.sub(r"^prod\d+-", "", sku)
        cleaned = re.sub(r"^(?:GAW|GWS?)", "", cleaned, flags=re.IGNORECASE)
        m = GW_ITEM_NUMBER_RE.search(cleaned) or GW_CATALOG_RE.search(cleaned)
        if m:
            return m.group(1)
    return None


def extract_product(html: str, url: str) -> RawProduct | None:
    """Parse product HTML (from browser) and extract structured data. Used for --inspect."""
    slug_part = url.split("/shop/")[-1].split("?")[0].rstrip("/")
    soup = BeautifulSoup(html, "lxml")

    title_tag = soup.find("title")
    page_title = title_tag.get_text().lower() if title_tag else ""
    h1_tag = soup.find("h1")
    h1_text = h1_tag.get_text().lower() if h1_tag else ""

    if "confirm you are human" in h1_text or "just a moment" in page_title:
        logger.warning("Cloudflare challenge detected at %s", url)
        return None

    canonical = soup.find("link", rel="canonical")
    og_url = soup.find("meta", property="og:url")
    if not canonical and not og_url and not soup.find_all("script", type="application/ld+json"):
        logger.warning("No product indicators found at %s — skipping", url)
        return None

    json_ld_data: dict[str, Any] = {}
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw = script.string or ""
            data = json.loads(raw)
            if isinstance(data, dict) and data.get("@graph"):
                for item in data["@graph"]:
                    if isinstance(item, dict) and item.get("@type") == "Product":
                        json_ld_data = item
                        break
            elif isinstance(data, dict) and data.get("@type") == "Product":
                json_ld_data = data
                break
        except Exception:
            pass

    name = json_ld_data.get("name", "")
    image_url: str | None = None
    if json_ld_data.get("image"):
        img = json_ld_data["image"]
        image_url = img[0] if isinstance(img, list) else img
    gw_rrp_usd = 0.0
    offers = json_ld_data.get("offers", {})
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    if isinstance(offers, dict):
        try:
            gw_rrp_usd = float(offers.get("price", 0))
        except (ValueError, TypeError):
            pass
    gw_item_number = _extract_item_number_from_json_ld(json_ld_data) or ""

    if not name:
        for selector in ("h1.product-name", "h1[class*='product']", "h1"):
            try:
                el = soup.select_one(selector)
                if el:
                    name = el.get_text().strip()
                    if name:
                        break
            except Exception:
                pass

    if not image_url:
        og_img = soup.find("meta", property="og:image")
        if og_img:
            image_url = og_img.get("content")  # type: ignore[arg-type]

    if not gw_item_number:
        gw_item_number = _extract_item_number_from_text(soup.get_text(separator=" ")) or ""

    if not name:
        logger.warning("No product name at %s", url)
        return None
    if not gw_item_number:
        logger.warning("No item number for '%s' (%s)", name, url)
        return None
    if gw_rrp_usd <= 0:
        logger.warning("No price for '%s' (%s)", name, url)
        return None

    product_slug = _make_slug(name, gw_item_number)
    return RawProduct(
        url=url, name=name, gw_item_number=gw_item_number,
        faction="Multi-faction", game_system="Warhammer 40,000",
        category="Miniatures", product_type="standard",
        gw_rrp_usd=gw_rrp_usd, image_url=image_url,
        slug=product_slug, raw_json_ld=json_ld_data,
    )


async def inspect_url(url: str, headful: bool = False) -> None:
    """Fetch a single product URL via browser and dump extraction results."""
    browser_config = BrowserConfig(
        headless=not headful, browser_type="chromium", channel="chrome",
        enable_stealth=True,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
    )
    run_config = CrawlerRunConfig(
        session_id="warhammer_inspect",
        magic=True, simulate_user=True, override_navigator=True,
        page_timeout=60000, delay_before_return_html=5.0,
        cache_mode=CacheMode.BYPASS, verbose=False,
    )
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url, config=run_config)

    if not result.success:
        print(f"Fetch failed: {result.error_message}")
        print(f"Status: {result.status_code}")
        print(f"\nHTML preview:\n{result.html[:3000]}")
        return

    product = extract_product(result.html, url)
    if product:
        print(json.dumps(
            {
                "name": product.name,
                "gw_item_number": product.gw_item_number,
                "faction": product.faction,
                "game_system": product.game_system,
                "category": product.category,
                "product_type": product.product_type,
                "gw_rrp_usd": product.gw_rrp_usd,
                "image_url": product.image_url,
                "slug": product.slug,
                "json_ld_fields": list(product.raw_json_ld.keys()),
            },
            indent=2,
        ))
    else:
        print("Extraction failed — check logs above for details")
        print(f"\nHTML preview (first 3000 chars):\n{result.html[:3000]}")


# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed GW product catalog from Algolia")
    parser.add_argument("--inspect", metavar="URL", help="Browser-inspect a single product URL")
    parser.add_argument(
        "--headful",
        action="store_true",
        default=os.environ.get("HEADLESS", "1") == "0",
        help="Open visible browser window (for --inspect mode)",
    )
    args = parser.parse_args()

    if args.inspect:
        await inspect_url(args.inspect, headful=args.headful)
        return

    if DRY_RUN:
        logger.info("DRY RUN — no DB writes")
    if RESUME:
        logger.info("RESUME mode — skipping products already in DB")

    # Fetch list of already-seeded item numbers (for resume)
    existing_item_numbers: set[str] = set()
    if RESUME and not DRY_RUN:
        async with await psycopg.AsyncConnection.connect(DSN) as conn:
            rows = await (
                await conn.execute("SELECT gw_item_number FROM products")
            ).fetchall()
            existing_item_numbers = {r[0] for r in rows}
        logger.info("Skipping %d already-seeded products", len(existing_item_numbers))

    # ── Step 1: Fetch all products from Algolia ────────────────────────
    logger.info("Fetching product catalog from Algolia index '%s'...", ALGOLIA_INDEX)
    try:
        hits = await fetch_all_algolia_products()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Algolia API error: %s — check ALGOLIA_APP_ID / ALGOLIA_API_KEY env vars "
            "or refresh the key from warhammer.com DevTools",
            exc,
        )
        sys.exit(1)
    logger.info("Retrieved %d raw records from Algolia", len(hits))

    # ── Step 2: Convert to RawProduct ─────────────────────────────────
    products = []
    skipped_type = 0
    skipped_no_sku = 0
    for hit in hits:
        p = algolia_hit_to_raw_product(hit)
        if p is None:
            algolia_type = hit.get("productType", "")
            if algolia_type in SKIP_PRODUCT_TYPES:
                skipped_type += 1
            else:
                skipped_no_sku += 1
            continue
        products.append(p)

    logger.info(
        "Converted %d products (%d skipped: type filter, %d skipped: no SKU/price)",
        len(products), skipped_type, skipped_no_sku,
    )

    if DRY_RUN:
        for p in products[:10]:
            logger.info(
                "  [DRY] %s | %s | $%.2f | %s | %s",
                p.name, p.gw_item_number, p.gw_rrp_usd, p.faction, p.game_system,
            )
        if len(products) > 10:
            logger.info("  ... and %d more", len(products) - 10)
        return

    # ── Step 3: Upsert into DB ─────────────────────────────────────────
    inserted = 0
    skipped_existing = 0
    errors = 0

    async with await psycopg.AsyncConnection.connect(DSN) as conn:
        for i, p in enumerate(products, 1):
            if p.gw_item_number in existing_item_numbers:
                skipped_existing += 1
                continue

            try:
                did_insert = await upsert_product(conn, p)
                await conn.commit()
                if did_insert:
                    inserted += 1
                    existing_item_numbers.add(p.gw_item_number)
                else:
                    skipped_existing += 1
            except Exception as exc:
                logger.warning("DB error for '%s' (%s): %s", p.name, p.gw_item_number, exc)
                await conn.rollback()
                errors += 1

            if i % 100 == 0:
                logger.info(
                    "Progress: %d inserted, %d skipped (existing), %d errors",
                    inserted, skipped_existing, errors,
                )

    logger.info(
        "=== Seed complete ===\n"
        "  inserted:          %d\n"
        "  skipped (exists):  %d\n"
        "  errors:            %d",
        inserted, skipped_existing, errors,
    )

    # Verify final count
    async with await psycopg.AsyncConnection.connect(DSN) as conn:
        row = await (await conn.execute("SELECT COUNT(*) FROM products")).fetchone()
        count = row[0] if row else 0
    logger.info("Total products in DB: %d", count)
    if count < 500:
        logger.warning(
            "Only %d products in DB — expected 1,500+. "
            "Run without DRY_RUN to populate, or check Algolia credentials.",
            count,
        )


if __name__ == "__main__":
    # psycopg async requires SelectorEventLoop on Windows (ProactorEventLoop is default in 3.12+)
    if sys.platform == "win32":
        import selectors
        asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(main())
