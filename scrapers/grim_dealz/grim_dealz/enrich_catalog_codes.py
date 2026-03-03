"""
Catalog-code enrichment for products.gw_catalog_code.

Populates the XX-XX retailer catalog code by fetching product pages from
Miniature Market and Discount Games Inc, then bag-of-words name-matching
against DB rows seeded from Algolia (which only provides 11-digit gw_item_number).

Designed to run as a Dagster asset between gw_product_catalog and the store
scrapers. Incremental — only processes products where gw_catalog_code IS NULL.

Matching strategy:
  Pass 1 — MM sitemap: extract gw-XX-XX.html URLs + og:title, BOW match, UPDATE
  Pass 2 — DGI categories: paginate 13 categories, extract MPN + name, BOW match
"""

from __future__ import annotations

import asyncio
import gzip
import logging
import re
from dataclasses import dataclass
from xml.etree import ElementTree as ET

import httpx
import psycopg
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Miniature Market ─────────────────────────────────────────────────
_MM_SITEMAP_INDEX = "https://www.miniaturemarket.com/sitemap.xml"
_MM_SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
_MM_CONCURRENCY = 8
_MM_SLEEP = 0.4

# ── Discount Games Inc ───────────────────────────────────────────────
_DGI_BASE_URL = "https://www.discountgamesinc.com"
_DGI_CATEGORIES = [
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
_DGI_CONCURRENCY = 4
_DGI_CAT_CONCURRENCY = 3
_DGI_SLEEP = 0.5

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; GrimDealzBot/1.0; "
        "+https://grimdealz.com/bot)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# ── Bag-of-words matching ────────────────────────────────────────────

_STOP_WORDS = frozenset(
    "the a an of and or in on for to at by with from".split()
    + "colour color paint pot".split()
    + "miniature miniatures model models kit set box games workshop gw".split()
)

_VOLUME_RE = re.compile(r"\(\s*[\d.]+\s*(?:ml|fl\s*oz)\s*\)", re.IGNORECASE)

_STRIP_PREFIXES_RE = re.compile(
    r"^(citadel\s+colour|citadel|"
    r"warhammer\s+40[,.]?000|warhammer\s+40k|warhammer|"
    r"age\s+of\s+sigmar|the\s+horus\s+heresy|horus\s+heresy|"
    r"the\s+old\s+world|middle[-\s]earth|"
    r"warcry|necromunda|blood\s+bowl|underworlds|"
    r"kill\s+team|warhammer\s+quest|"
    r"games\s+workshop\s*-\s*gaw|games\s+workshop)[:\s\-]+",
    re.IGNORECASE,
)


def _make_bow_key(name: str) -> frozenset[str]:
    """Normalize a product name to a bag-of-words key for fuzzy matching."""
    name = name.split(" | ")[0].strip()
    name = _VOLUME_RE.sub("", name).strip()
    for _ in range(4):
        stripped = _STRIP_PREFIXES_RE.sub("", name, count=1).strip(" :-")
        if stripped == name:
            break
        name = stripped
    words = re.sub(r"[^a-z0-9]", " ", name.lower()).split()
    return frozenset(w for w in words if len(w) > 1 and w not in _STOP_WORDS)


def _bow_match(
    key: frozenset[str],
    index: dict[frozenset[str], tuple[str, str]],
) -> tuple[str, str] | None:
    """Bag-of-words match: exact first, then subset (DB words <= retailer words, max 5 extra)."""
    hit = index.get(key)
    if hit:
        return hit

    if len(key) >= 2:
        best: tuple[str, str] | None = None
        best_extra = 6
        for db_key, value in index.items():
            if len(db_key) >= 1 and db_key <= key:
                extra = len(key) - len(db_key)
                if extra <= 5 and extra < best_extra:
                    best = value
                    best_extra = extra
        if best:
            return best

    return None


# ── HTML helpers ─────────────────────────────────────────────────────

def _extract_page_name(html: str) -> str | None:
    """Extract product name from og:title or h1."""
    soup = BeautifulSoup(html, "html.parser")
    og = soup.find("meta", property="og:title")
    if og:
        content = (og.get("content") or "").strip()
        if content:
            return content.split(" | ")[0].strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(separator=" ").strip()
    return None


# Widened from \d{2}-\d{2} to support 3-digit codes (e.g. Blood Bowl 202-42)
_MM_URL_RE = re.compile(r"/gw-(\d{2,3}-\d{2,3})\.html")
_MM_SITEMAP_FILTER_RE = re.compile(r"/gw-\d{2,3}-\d{2,3}\.html$")
_DGI_MPN_RE = re.compile(r"^\d{2,3}-\d{2,3}(-\d{2})?$")


def _mm_extract_item_number(url: str) -> str | None:
    m = _MM_URL_RE.search(url)
    return m.group(1) if m else None


def _dgi_extract_mpn(html: str) -> str | None:
    """Extract GW item number from DGI product page MPN field."""
    soup = BeautifulSoup(html, "html.parser")
    mpn_tag = soup.find("meta", attrs={"itemprop": "mpn"})
    if not mpn_tag:
        return None
    mpn = (mpn_tag.get("content") or "").strip().upper()
    if mpn.startswith("GAW"):
        candidate = mpn[3:]
        if _DGI_MPN_RE.fullmatch(candidate):
            return candidate
    return None


# ── DB helpers ───────────────────────────────────────────────────────

async def _load_products_index(
    conn: psycopg.AsyncConnection,
) -> dict[frozenset[str], tuple[str, str]]:
    """Load products where gw_catalog_code IS NULL into a BOW index.

    Returns: {bow_key -> (product_id, name)}
    """
    rows = await (
        await conn.execute(
            "SELECT id, name FROM products "
            "WHERE gw_catalog_code IS NULL AND is_active = TRUE"
        )
    ).fetchall()
    index: dict[frozenset[str], tuple[str, str]] = {}
    collisions = 0
    for product_id, name in rows:
        key = _make_bow_key(name)
        if not key:
            continue
        if key in index:
            collisions += 1
        else:
            index[key] = (product_id, name)
    logger.info(
        "Loaded %d products into BOW index (%d key collisions ignored)",
        len(index), collisions,
    )
    return index


async def _update_catalog_code(
    conn: psycopg.AsyncConnection, product_id: str, code: str
) -> bool:
    """Set gw_catalog_code on a product. Returns False if code already taken.

    Requires autocommit=True on the connection so each UPDATE is its own
    transaction — concurrent coroutines won't poison each other's state.
    """
    try:
        await conn.execute(
            "UPDATE products SET gw_catalog_code = %s WHERE id = %s",
            (code, product_id),
        )
        return True
    except psycopg.errors.UniqueViolation:
        logger.debug("Catalog code %s already assigned — skipping", code)
        return False


# ── Pass 1: Miniature Market ────────────────────────────────────────

async def _run_mm_pass(
    client: httpx.AsyncClient,
    conn: psycopg.AsyncConnection,
    index: dict[frozenset[str], tuple[str, str]],
) -> tuple[int, int]:
    """Fetch MM sitemap, iterate product pages, populate gw_catalog_code.

    Returns (matched, attempted).
    """
    logger.info("[MM] Fetching sitemap index...")
    resp = await client.get(_MM_SITEMAP_INDEX)
    root = ET.fromstring(resp.text)
    gz_urls = [
        elem.text
        for elem in root.findall(f".//{{{_MM_SITEMAP_NS}}}loc")
        if elem.text and elem.text.endswith(".xml.gz")
    ]
    if not gz_urls:
        logger.error("[MM] No .xml.gz found in sitemap index")
        return 0, 0

    logger.info("[MM] Downloading sitemap: %s", gz_urls[0])
    resp = await client.get(gz_urls[0])
    xml_bytes = gzip.decompress(resp.content)
    sitemap_root = ET.fromstring(xml_bytes)

    product_urls = [
        elem.text
        for elem in sitemap_root.findall(f".//{{{_MM_SITEMAP_NS}}}loc")
        if elem.text and _MM_SITEMAP_FILTER_RE.search(elem.text)
    ]
    logger.info("[MM] %d GW product URLs in sitemap", len(product_urls))

    sem = asyncio.Semaphore(_MM_CONCURRENCY)
    matched = 0
    attempted = 0
    sample_unmatched: list[str] = []

    async def process_url(url: str) -> None:
        nonlocal matched, attempted
        item_number = _mm_extract_item_number(url)
        if not item_number:
            return

        async with sem:
            await asyncio.sleep(_MM_SLEEP)
            try:
                resp = await client.get(url)
            except Exception as exc:
                logger.debug("[MM] Fetch error %s: %s", url, exc)
                return

        name = _extract_page_name(resp.text)
        if not name:
            return

        attempted += 1
        key = _make_bow_key(name)
        hit = _bow_match(key, index)
        if hit:
            product_id, db_name = hit
            # Pop BEFORE await — prevents race condition (UniqueViolation)
            index.pop(key, None)
            if await _update_catalog_code(conn, product_id, item_number):
                matched += 1
                logger.debug("[MM] matched %s  retailer=%r  db=%r", item_number, name, db_name)
        else:
            if len(sample_unmatched) < 30:
                sample_unmatched.append(f"{item_number}: {name!r}")

    await asyncio.gather(*[process_url(u) for u in product_urls])

    logger.info("[MM] Pass complete: %d/%d matched", matched, attempted)
    if sample_unmatched:
        logger.info(
            "[MM] Sample unmatched (first %d):\n  %s",
            len(sample_unmatched), "\n  ".join(sample_unmatched),
        )
    return matched, attempted


# ── Pass 2: Discount Games Inc ──────────────────────────────────────

async def _dgi_paginate_category(
    client: httpx.AsyncClient,
    category_path: str,
    sem: asyncio.Semaphore,
) -> set[str]:
    """Collect all unique product URLs from one DGI category."""
    seen: set[str] = set()
    page = 1
    while True:
        url = (
            f"{_DGI_BASE_URL}{category_path}"
            if page == 1
            else f"{_DGI_BASE_URL}{category_path.rstrip('/')}/page{page}.html"
        )
        try:
            async with sem:
                resp = await client.get(url)
            await asyncio.sleep(_DGI_SLEEP)
            soup = BeautifulSoup(resp.text, "html.parser")
            page_urls = {
                tag["data-url"]
                for tag in soup.find_all(attrs={"data-url": True})
                if "discountgamesinc.com/" in tag.get("data-url", "")
            }
            new = page_urls - seen
            if not new:
                break
            seen.update(new)
            page += 1
        except Exception as exc:
            logger.debug("[DGI] Category page error %s: %s", url, exc)
            break
    return seen


async def _run_dgi_pass(
    client: httpx.AsyncClient,
    conn: psycopg.AsyncConnection,
    index: dict[frozenset[str], tuple[str, str]],
) -> tuple[int, int]:
    """Paginate DGI categories, fetch product pages, populate gw_catalog_code.

    Returns (matched, attempted).
    """
    logger.info("[DGI] Collecting product URLs from %d categories...", len(_DGI_CATEGORIES))
    cat_sem = asyncio.Semaphore(_DGI_CAT_CONCURRENCY)
    per_cat = await asyncio.gather(
        *[_dgi_paginate_category(client, path, cat_sem) for path in _DGI_CATEGORIES]
    )
    product_urls = set().union(*per_cat)
    logger.info("[DGI] %d unique product URLs collected", len(product_urls))

    sem = asyncio.Semaphore(_DGI_CONCURRENCY)
    matched = 0
    attempted = 0
    sample_unmatched: list[str] = []

    async def process_url(url: str) -> None:
        nonlocal matched, attempted
        async with sem:
            await asyncio.sleep(_DGI_SLEEP)
            try:
                resp = await client.get(url)
            except Exception as exc:
                logger.debug("[DGI] Fetch error %s: %s", url, exc)
                return

        item_number = _dgi_extract_mpn(resp.text)
        if not item_number:
            return

        name = _extract_page_name(resp.text)
        if not name:
            return

        attempted += 1
        key = _make_bow_key(name)
        hit = _bow_match(key, index)
        if hit:
            product_id, db_name = hit
            # Pop BEFORE await — prevents race condition (UniqueViolation)
            index.pop(key, None)
            if await _update_catalog_code(conn, product_id, item_number):
                matched += 1
                logger.debug("[DGI] matched %s  retailer=%r  db=%r", item_number, name, db_name)
        else:
            if len(sample_unmatched) < 30:
                sample_unmatched.append(f"{item_number}: {name!r}")

    await asyncio.gather(*[process_url(u) for u in product_urls])

    logger.info("[DGI] Pass complete: %d/%d matched", matched, attempted)
    if sample_unmatched:
        logger.info(
            "[DGI] Sample unmatched (first %d):\n  %s",
            len(sample_unmatched), "\n  ".join(sample_unmatched),
        )
    return matched, attempted


# ── Public entry point (called by Dagster asset) ────────────────────

@dataclass
class EnrichmentStats:
    """Stats returned by enrich_catalog_codes() for Dagster metadata."""
    products_needing_codes: int
    mm_matched: int
    mm_attempted: int
    dgi_matched: int
    dgi_attempted: int
    total_populated: int


async def enrich_catalog_codes(dsn: str, log: logging.Logger | None = None) -> EnrichmentStats:
    """Run both enrichment passes and return stats.

    Args:
        dsn: PostgreSQL connection string (DIRECT_URL).
        log: Optional Dagster logger (falls back to module logger).
    """
    _log = log or logger

    async with httpx.AsyncClient(
        headers=_HEADERS,
        timeout=httpx.Timeout(30.0, connect=10.0),
        follow_redirects=True,
        http2=True,
    ) as client:
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            index = await _load_products_index(conn)
            products_needing_codes = len(index)
            _log.info("Products needing catalog codes: %d", products_needing_codes)

            if products_needing_codes == 0:
                _log.info("All products already have catalog codes — skipping enrichment")
                row = await (
                    await conn.execute(
                        "SELECT COUNT(*) FROM products WHERE gw_catalog_code IS NOT NULL"
                    )
                ).fetchone()
                return EnrichmentStats(
                    products_needing_codes=0,
                    mm_matched=0, mm_attempted=0,
                    dgi_matched=0, dgi_attempted=0,
                    total_populated=row[0] if row else 0,
                )

            mm_matched, mm_attempted = await _run_mm_pass(client, conn, index)
            dgi_matched, dgi_attempted = await _run_dgi_pass(client, conn, index)

            row = await (
                await conn.execute(
                    "SELECT COUNT(*) FROM products WHERE gw_catalog_code IS NOT NULL"
                )
            ).fetchone()
            total_populated = row[0] if row else 0

            _log.info(
                "Enrichment complete: MM %d/%d, DGI %d/%d, total populated: %d",
                mm_matched, mm_attempted, dgi_matched, dgi_attempted, total_populated,
            )

            return EnrichmentStats(
                products_needing_codes=products_needing_codes,
                mm_matched=mm_matched,
                mm_attempted=mm_attempted,
                dgi_matched=dgi_matched,
                dgi_attempted=dgi_attempted,
                total_populated=total_populated,
            )
