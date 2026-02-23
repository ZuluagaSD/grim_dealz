# GrimDealz — CLAUDE.md

Warhammer price comparison site. Next.js 14 frontend + Python scrapers + Supabase PostgreSQL.

## Stack

- **Frontend:** Next.js 14 App Router + Tailwind CSS → Vercel
- **DB:** PostgreSQL via Supabase + Prisma ORM
- **Scrapers:** Python 3.11+ with `uv`, httpx + Playwright + tenacity → GitHub Actions cron
- **Package manager:** `npm` (web/), `uv` (scrapers/)

## Project Structure

```
grim_dealz/
├── web/            # Next.js 14 app (App Router)
├── scrapers/       # Python scraper package
├── shared/schemas/ # JSON Schema contracts between Python and TypeScript
└── docs/plans/     # Feature plans
```

## Critical Patterns

### ISR Cache Strategy

**Never use `React.cache()` alone for ISR** — it does NOT respond to `revalidateTag()`.
Always pair `unstable_cache` + `React.cache()`:

```typescript
// web/app/lib/data.ts
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

export const getProduct = cache(
  unstable_cache(
    async (slug: string) => { /* DB query */ },
    ['product'],
    { revalidate: 14400, tags: ['products'] }  // 4h
  )
)
```

Tags: `products`, `listings`, `deals`, `factions`

### Decimal Serialization

Prisma returns `Decimal` objects, but `unstable_cache` JSON-stringifies results — after deserialization, Decimal fields come back as **strings** (e.g., `"35.00"`). `.toNumber()` fails on strings.

**Always use `toNum()` in `data.ts`** — it handles Decimal, string, and number:

```typescript
// web/lib/data.ts — eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNum(v: any): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v)
  if (v !== null && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

// ✅ Use in serialization helpers
gwRrpUsd: toNum(product.gwRrpUsd),
currentPrice: toNum(listing.currentPrice),

// ✅ In page components — use Number() for one-off conversions
gwRrpUsd={Number(product.gwRrpUsd)}

// ❌ Never in components or pages
product.gwRrpUsd.toNumber()  // fails when value is a string post-cache
```

### Affiliate Redirect Pattern

`/go/[store]/[id]` — the entire revenue mechanism.

```typescript
// web/app/go/[store]/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ALWAYS validate store slug matches listing (prevents cross-store redirects)
const listing = await prisma.listing.findUnique({
  where: { id: params.id },
  include: { store: true },
})
if (!listing || listing.store.slug !== params.store) {
  return new Response(null, { status: 404 })
}

// Fire-and-forget click log — explicit void satisfies no-floating-promises
void logClick(listing.id)

return NextResponse.redirect(listing.affiliateUrl ?? listing.storeProductUrl, {
  status: 302,
  headers: {
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  },
})
```

### Click Logging

```typescript
async function logClick(listingId: string): Promise<void> {
  await prisma.clickEvent.create({
    data: { listingId },  // Only listing_id + clicked_at (auto). NO IP, NO UA.
  })
}
```

No PII stored in `click_events`. Plausible/Umami handles geo + device analytics.

### Stock Status Normalization

Raw retailer strings → canonical enum values. **All normalization happens once in `base_store.py`.**

```python
# scrapers/base_store.py
normalize_stock_status("In Stock")     # → StockStatus.in_stock
normalize_stock_status("Sold Out")     # → StockStatus.out_of_stock
normalize_stock_status("Pre-Order")    # → StockStatus.pre_order
```

If a new store uses an unrecognized string, add it to `_STOCK_NORMALIZATION` in `base_store.py`.

### Price History — Write on Change Only

Only write `price_history` when `current_price` OR `stock_status` changes. **Not every scrape.**

```python
# db.py
if prev_price != current_price or prev_status != stock_status:
    await conn.execute("INSERT INTO price_history ...")
```

This keeps row count ~50-100K/year instead of ~120K/day.

### discount_pct — Computed, Not Stored on Listing

`products.gw_rrp_usd` is the single source of truth.

```python
# db.py — computed during upsert
discount_pct = (gw_rrp_usd - current_price) / gw_rrp_usd * 100
```

Never store `gw_rrp_usd` on `listings` (was removed as a schema bloat issue).

## TypeScript Conventions

- `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`
- ESLint: `@typescript-eslint/no-explicit-any: error` + `@typescript-eslint/no-floating-promises: error`
- Enums are Prisma-level only (not TypeScript enums) — import from `@prisma/client`
- All async fire-and-forget calls use explicit `void`: `void logClick(id)`

## Python Conventions

- Python 3.12, `uv` for dependency management
- **Windows only:** psycopg3 async requires `SelectorEventLoop` (ProactorEventLoop, default in 3.12, is incompatible):
  ```python
  if sys.platform == "win32":
      asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
  else:
      asyncio.run(main())
  ```
- Type annotations on all public functions
- `StockStatus` is `StrEnum` in `base_store.py` — values must match Prisma schema exactly
- All scrapers are `async with` context managers extending `BaseStore`
- Validate `PriceResult` against `shared/schemas/price_result.schema.json` before DB write (jsonschema)
- Rate limit: `await asyncio.sleep(3)` minimum between pages within a scraper

## DB Conventions

- Two-URL pattern: `DATABASE_URL` (port 6543 pooled, `?pgbouncer=true&connection_limit=1`) for Next.js app
- `DIRECT_URL` (port 5432 direct) for Prisma migrations + Python scrapers
- Prisma enums map to PostgreSQL enums — add `::\"EnumName\"` cast in raw psycopg3 queries
- `UNIQUE(product_id, store_id)` on `listings` — prevents duplicate scraper insertions
- Slugs are generated once, stable (301 redirect if name changes later)

## Adding a New Store

1. Create `scrapers/stores/<store_slug>.py` extending `BaseStore`
2. Set `store_slug` to match `stores.slug` in DB
3. Implement `scrape() -> list[PriceResult]`
4. Use `normalize_stock_status()` for all stock strings
5. Add to `SCRAPERS` list in `run_all.py`
6. Update the store's `is_active = True` in seed.ts + re-run seed
7. Apply for affiliate program (requires live site URL)

## Running Locally

```bash
# Web
cd web
npm install
npx prisma generate
npx prisma migrate dev  # or db push for dev
npm run dev

# Scrapers
cd scrapers
uv sync
uv run python -m scrapers.run_all  # dry run: add DRY_RUN=1

# Seed stores
cd web
npm run db:seed
```

## ISR Revalidation Times

| Page | revalidate | Cache tag |
|------|-----------|-----------|
| Homepage | 3600 (1h) | `deals`, `listings` |
| `/product/[slug]` | 14400 (4h) | `products`, `listings` |
| `/deals` | 3600 (1h) | `listings` |
| `/faction/[slug]` | 21600 (6h) | `products`, `listings` |
| `/battleforce-tracker` | 3600 (1h) | `products`, `listings` |
| `/go/[store]/[id]` | force-dynamic | — |
