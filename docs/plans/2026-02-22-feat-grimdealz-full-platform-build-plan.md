---
title: GrimDealz — Warhammer Price Comparison Platform
type: feat
date: 2026-02-22
revised: 2026-02-22
---

# GrimDealz — Warhammer Price Comparison Platform

> **v1.1** — Updated after parallel review by DHH, Kieran (TypeScript), and Code Simplicity reviewers.
> Key changes: Prisma enum fixes, `unstable_cache` ISR bug fixed, schema bloat removed, Amazon moved to Phase 3, admin deferred, route count reduced.

## Overview

GrimDealz is a real-time price comparison and deal-tracking website for Warhammer 40K, Age of Sigmar, Horus Heresy, and other Games Workshop products. It aggregates prices across 10+ authorized US retailers, surfaces daily deals and price drops, and earns passive income via affiliate commissions and display advertising.

**Build window:** 8–10 weeks, solo developer
**Revenue model:** Affiliate commissions (7–10% blended) + display ads (Phase 4)
**Hosting:** Vercel (Next.js frontend) + Railway/Render (Python scrapers) + Supabase (PostgreSQL)

---

## Problem Statement

No dedicated Warhammer price comparison site exists for the US market. The GW community is notoriously price-sensitive — "GW tax" is one of the most-searched phrases in the hobby — yet no tool automatically identifies the cheapest authorized retailer. Third-party retailers discount 10–25% off GW RRP by default. An average order of $85–150 with $12 saved per click creates strong affiliate conversion incentive. Search volume for faction, product, and deal terms is massive and largely uncontested.

---

## Proposed Solution

A programmatic SEO-driven price comparison site backed by a polling scraper infrastructure. The site pre-builds ~2,000+ product pages at deploy time (ISR) with real price data from 10+ stores, refreshed every 4 hours via GitHub Actions cron jobs. Revenue flows through a `/go/[store]/[id]` affiliate redirect with async click logging.

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   VERCEL (Edge CDN)                  │
│  Next.js 14 App Router                               │
│  ISR pages (products, factions, deals, trackers)    │
│  SSR pages (search)                                  │
│  Route Handlers (/go/, /api/revalidate, /sitemap)   │
└──────────────────────┬──────────────────────────────┘
                       │ Prisma (pooled via Supavisor)
┌──────────────────────▼──────────────────────────────┐
│              SUPABASE (PostgreSQL)                   │
│  products · stores · listings · price_history        │
│  click_events                                        │
└──────────────────────▲──────────────────────────────┘
                       │ Direct URL (upsert)
┌──────────────────────┴──────────────────────────────┐
│          RAILWAY / RENDER (Python worker)            │
│  scrapers/ — BaseStore + per-store implementations  │
│  Triggered by GitHub Actions cron (every 4h)        │
│  Posts revalidation webhook after each run          │
└─────────────────────────────────────────────────────┘
```

> **Architecture note (DHH):** Prisma in a Vercel serverless context requires the two-URL/Supavisor workaround documented below. An alternative with less ceremony is the Supabase JS client (`@supabase/ssr`) + `supabase gen types typescript`, which handles connection pooling transparently. Both approaches are valid; Prisma is kept here for its migration tooling and explicit schema ownership, but the tradeoff is real.

### Monorepo Structure

```
grim_dealz/
├── web/                          # Next.js 14 app
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── page.tsx          # Homepage — ISR 1h
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── layout.tsx
│   │   ├── product/
│   │   │   └── [slug]/
│   │   │       ├── page.tsx      # Product detail — ISR 4h
│   │   │       ├── loading.tsx
│   │   │       ├── error.tsx
│   │   │       └── not-found.tsx
│   │   ├── search/
│   │   │   ├── page.tsx          # Search — SSR
│   │   │   ├── loading.tsx
│   │   │   └── error.tsx
│   │   ├── deals/
│   │   │   ├── page.tsx          # Deals + price drops — ISR 1h
│   │   │   ├── loading.tsx       # ?window=24h|7d query param
│   │   │   └── error.tsx
│   │   ├── faction/
│   │   │   └── [slug]/
│   │   │       ├── page.tsx      # ISR 6h
│   │   │       ├── loading.tsx
│   │   │       └── error.tsx
│   │   ├── battleforce-tracker/
│   │   │   ├── page.tsx          # ISR 1h — Phase 3
│   │   │   └── error.tsx
│   │   ├── combat-patrol-tracker/
│   │   │   ├── page.tsx          # ISR 6h — Phase 3
│   │   │   └── error.tsx
│   │   ├── new-releases/
│   │   │   └── page.tsx          # ISR 2h — Phase 3
│   │   ├── go/
│   │   │   └── [store]/[id]/
│   │   │       └── route.ts      # Affiliate redirect — force-dynamic
│   │   ├── api/
│   │   │   └── revalidate/
│   │   │       └── route.ts      # On-demand ISR webhook
│   │   ├── admin/                # Phase 4 — use Prisma Studio until then
│   │   │   └── page.tsx
│   │   ├── error.tsx             # Global error boundary
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── components/
│   │   ├── server/               # Server Components (no 'use client')
│   │   │   ├── ProductCard.tsx
│   │   │   ├── PriceComparisonTable.tsx
│   │   │   └── ProductJsonLd.tsx
│   │   └── client/               # Client Components ('use client')
│   │       ├── PriceHistoryChart.tsx  # Recharts — requires browser APIs
│   │       └── FactionFilter.tsx     # useRouter, filter state
│   ├── lib/
│   │   ├── prisma.ts             # Singleton Prisma client
│   │   ├── types.ts              # App-level types (must exist before data.ts)
│   │   └── data.ts               # unstable_cache + React.cache() queries
│   └── prisma/
│       └── schema.prisma
│
├── scrapers/                     # Python package
│   ├── base_store.py
│   ├── db.py                     # Supabase upsert helpers
│   ├── run_all.py                # Entry point for GH Actions
│   ├── seed_catalog.py           # One-time GW catalog seed
│   └── stores/
│       ├── miniature_market.py   # Phase 1 — P0
│       ├── discount_games_inc.py # Phase 1 — P0
│       ├── noble_knight.py       # Phase 3 — P1
│       ├── atomic_empire.py      # Phase 3 — P1
│       ├── frontline_gaming.py   # Phase 3 — P1
│       ├── amazon.py             # Phase 3 — PA-API (requires live site + sales)
│       ├── wargame_portal.py     # Phase 4
│       ├── j15_games.py          # Phase 4
│       └── gamers_guild_az.py    # Phase 4
│
├── shared/
│   └── schemas/
│       └── price_result.schema.json  # JSON Schema — Python validates on write,
│                                     # Zod validates on DB read
│
├── .github/
│   └── workflows/
│       └── scrape-prices.yml     # Cron every 4h
│
├── docs/
│   └── plans/
│
├── CLAUDE.md                     # Project conventions (hashIp format documented here)
└── .env.example
```

### Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSG/ISR for SEO, React Server Components |
| Styling | Tailwind CSS | Rapid UI, responsive by default |
| Database | PostgreSQL (Supabase) | Free tier to start |
| ORM | Prisma | Type-safe, two-URL pattern for Supavisor |
| Scraping | Python + Playwright/httpx + tenacity | Headless for JS sites, httpx for REST |
| Scheduler | GitHub Actions cron | Free for public repos |
| Hosting FE | Vercel | Auto-deploy, edge CDN, ISR support |
| Hosting Scraper | Railway or Render | ~$5/mo Python worker |
| Search | Postgres FTS (`tsvector`) | Upgrade to Meilisearch/Typesense at >10K products |
| Analytics | Plausible or Umami | Privacy-friendly; covers geo/UA data so click_events doesn't need to |
| Affiliate Redirect | `/go/[store]/[id]` | Log click async → 302 to affiliate URL |

---

## Database Schema

### ERD

```mermaid
erDiagram
    products {
        uuid id PK
        text slug UK
        text name
        text gw_item_number UK
        text faction
        text game_system
        text category
        ProductType product_type
        decimal gw_rrp_usd
        text image_url
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    stores {
        uuid id PK
        text slug UK
        text name
        text base_url
        text region
        text affiliate_tag
        text affiliate_network
        decimal commission_pct
        decimal typical_discount_pct
        boolean is_active
    }

    listings {
        uuid id PK
        uuid product_id FK
        uuid store_id FK
        text store_product_url
        text store_sku
        decimal current_price
        decimal discount_pct
        boolean in_stock
        StockStatus stock_status
        text affiliate_url
        timestamptz last_scraped
        timestamptz last_checked_at
    }

    price_history {
        uuid id PK
        uuid listing_id FK
        decimal price
        decimal discount_pct
        boolean in_stock
        timestamptz scraped_at
    }

    click_events {
        uuid id PK
        uuid listing_id FK
        timestamptz clicked_at
    }

    products ||--o{ listings : "tracked at"
    stores ||--o{ listings : "lists"
    listings ||--o{ price_history : "history"
    listings ||--o{ click_events : "clicks"
```

### Prisma Enums (define before first migration)

```prisma
enum ProductType {
  standard
  battleforce
  combat_patrol
  paint
  codex
  terrain
}

enum StockStatus {
  in_stock
  out_of_stock
  backorder
  pre_order
  limited
}
```

> **Why enums matter:** `stock_status` as `text` lets scrapers write `"In Stock"`, `"in stock"`, `"IN_STOCK"` — all accepted, all rendered inconsistently. The Prisma enum enforces normalization at the schema level. Python scrapers map their raw strings to the enum values in `base_store.py` before upsert — once, centrally.

### Schema Notes

- `listings.gw_rrp_usd` — **removed** (duplicate of `products.gw_rrp_usd`; join to products when `discount_pct` needs recalculation)
- `listings.currency` — **removed** (YAGNI; add when Element Games UK onboarding requires it)
- `click_events` — **simplified** to just `listing_id + clicked_at`; Plausible/Umami handles geo/UA analytics; no PII stored, no GDPR surface area
- `listings.last_checked_at` — always display on product page (trust signal: "Prices verified 3h ago")
- `products.product_type` — enum `ProductType`; drives tracker pages without a separate model
- `price_history` — only write a new row when price OR stock status changes (not every scrape)
- `UNIQUE(product_id, store_id)` constraint on `listings` — prevents duplicate scraper insertions

### Prisma Connection Setup

```prisma
// web/prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled via Supavisor (port 6543)
  directUrl = env("DIRECT_URL")     // direct (port 5432) — migrations only
}
```

```
# .env
DATABASE_URL="postgresql://postgres.[ref]:[pwd]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[pwd]@db.[ref].supabase.co:5432/postgres"
```

---

## Pre-Implementation Decisions Required

These must be answered **before writing code**.

### Priority 1 — Blockers

| # | Decision | Recommended Default | Impact if Deferred |
|---|---|---|---|
| D1 | **Admin auth mechanism** | Supabase Auth + single admin user via env var | `/admin` ships insecure; defer admin to Phase 4 and use Prisma Studio in the interim |
| D2 | **Amazon: PA-API timing** | Move to Phase 3 (requires live site + 3 qualifying sales for PA-API approval) | Phase 1 unblocked without it |
| D3 | **"Deal" definition** | Any listing ≥5% below GW RRP | Drives homepage, `/deals`, price drop logic |
| D4 | **"Daily drop" definition** | Largest absolute price decrease in last 24h, ≥5% off RRP | Homepage section content |
| D5 | **Affiliate URL construction per store** | Document each store's deep link format before building `/go/` | `/go/` is the entire revenue mechanism |
| D6 | **Stale data display** | Show `last_checked_at` timestamp on every price row | Trust and user expectation |

### Priority 2 — Important Before Phase 2

| # | Decision | Recommended Default |
|---|---|---|
| D7 | **Search infrastructure** | PostgreSQL `tsvector` for v1 |
| D8 | **Stock status UX** | Show OOS rows greyed out, "Out of Stock" badge; do not hide |
| D9 | **Price history chart time ranges** | 30d default, 7d / 90d / all-time toggle; "Tracking since [date]" label |
| D10 | **Slug generation & stability** | Generated once from GW item number + normalized name; 301 redirect on rename |
| D11 | **Privacy policy + affiliate disclosure** | Required before first user reaches the site (FTC) |
| D12 | **Scraper parallelism** | Run stores in parallel; `connection_limit=1` per serverless function |

---

## Implementation Phases

### Phase 1 — Catalog & Scrapers (Weeks 1–3)

**Goal:** Live price data in DB. 2 stores matched to GW catalog. Foundation for everything.

#### Week 1 — DB Foundation

- [ ] Initialize monorepo: `web/` (Next.js) + `scrapers/` (Python with `uv`) + `shared/schemas/`
- [ ] Create Supabase project, configure `DATABASE_URL` + `DIRECT_URL`
- [ ] Write `web/prisma/schema.prisma`:
  - Define `ProductType` and `StockStatus` enums before any table definitions
  - `listings` without `gw_rrp_usd` or `currency` columns
  - `click_events` with only `id`, `listing_id`, `clicked_at`
  - `UNIQUE(product_id, store_id)` on `listings`
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Seed taxonomy: factions (40+), game systems, categories, product types as DB seed data
- [ ] Verify schema with `npx prisma studio`

**Files:**
- `web/prisma/schema.prisma`
- `web/prisma/seed.ts`

#### Week 2 — GW Catalog Seed

- [ ] Write `scrapers/seed_catalog.py` — one-time Playwright scrape of `warhammer.com`
  - Extract: name, `gw_item_number`, faction, game system, image URL, GW RRP
  - Write directly to `products` via psycopg2/Supabase Python client
  - Rate limit: 3–5s between requests
- [ ] Write `shared/schemas/price_result.schema.json` — JSON Schema defining the scraper output contract:
  - Python scrapers validate against it before DB write (via `jsonschema` library)
  - TypeScript validates on read (via `zod` in `scrapers/db.ts` if needed)
- [ ] Run seed script; verify 1,500+ products in DB
- [ ] Manual QA: spot-check 20 products for correct item numbers and faction

**Files:**
- `scrapers/seed_catalog.py`
- `scrapers/db.py`
- `shared/schemas/price_result.schema.json`

#### Week 3 — First 2 Scrapers + GitHub Actions

- [ ] Implement `scrapers/base_store.py`:
  - Async context manager
  - httpx client + tenacity retry (3 attempts, exponential backoff)
  - Jittered rate limiting
  - `PriceResult` dataclass — **normalizes `stock_status` to `StockStatus` enum values**
  - `StockStatus` normalization map: `"In Stock"` → `"in_stock"`, etc. — lives here once
- [ ] Implement `scrapers/stores/miniature_market.py` (P0)
- [ ] Implement `scrapers/stores/discount_games_inc.py` (P0)
- [ ] **Amazon PA-API** — deferred to Phase 3 (cannot get approval without live site + qualifying sales)
- [ ] Implement `scrapers/db.py` — upsert logic:
  - Upsert `listings` (ON CONFLICT on `product_id, store_id`)
  - Write `price_history` row **only if price or stock changed**
  - Compute `discount_pct = (products.gw_rrp_usd - current_price) / products.gw_rrp_usd * 100` via JOIN — not stored on listings
  - Log stats: products_found, matched, updated, errors
- [ ] Implement `scrapers/run_all.py`:
  - Run active stores
  - Call `/api/revalidate` webhook after completion
- [ ] Set up GitHub Actions (email notification on failure is sufficient — no Slack webhook):

```yaml
# .github/workflows/scrape-prices.yml
name: Scrape Prices
on:
  schedule:
    - cron: '0 */4 * * *'
  workflow_dispatch:
jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv python install 3.12
      - run: uv sync --frozen
      - run: uv run playwright install chromium --with-deps
      - run: uv run python -m scrapers.run_all
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          REVALIDATE_SECRET: ${{ secrets.REVALIDATE_SECRET }}
          NEXT_APP_URL: ${{ secrets.NEXT_APP_URL }}
      # GitHub Actions sends email on failure by default — no Slack webhook needed
```

**Phase 1 Success Criteria:**
- 500+ matched listings in DB with real prices
- Scrapers run via `workflow_dispatch` with 0 crashes
- `price_history` accumulating data across 3+ runs
- GW item number match rate ≥80% for Miniature Market + Discount Games Inc

---

### Phase 2 — Core Frontend (Weeks 4–6)

**Goal:** Live public site on Vercel with real prices. 7 routes. MVP.

#### Week 4 — TypeScript Infrastructure First

> **Do this before writing any application code.** These are not optional polish — they prevent entire categories of bugs.

- [ ] Initialize Next.js 14 in `web/` with App Router + Tailwind CSS
- [ ] Configure `web/tsconfig.json` with strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true
  }
}
```

- [ ] Configure `web/.eslintrc.json`:

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

- [ ] Create `web/lib/types.ts` **before `data.ts`**:

```typescript
// web/lib/types.ts
import type { Prisma } from '@prisma/client';

// Exact shape returned by getProduct
export type ProductWithListings = Prisma.ProductGetPayload<{
  include: {
    listings: {
      include: { store: true };
      orderBy: { current_price: 'asc' };
    };
  };
}>;

// Options bag for getDeals — typed, not untyped object
export type GetDealsOptions = {
  minDiscountPct?: number;
  inStockOnly?: boolean;
  limit?: number;
  offset?: number;
  faction?: string;
  gameSystem?: string;
};

// Serialized form safe for components — Decimal converted to number, no Prisma types
export type SerializedListing = {
  id: string;
  storeSlug: string;
  storeName: string;
  currentPrice: number;       // Prisma.Decimal.toNumber()
  discountPct: number;
  inStock: boolean;
  stockStatus: string;
  affiliateUrl: string;
  lastCheckedAt: string;      // ISO string — Date serialized for Client Components
};

// What ProductCard actually receives — pre-computed, not raw Prisma
export type ProductCardData = {
  slug: string;
  name: string;
  faction: string;
  imageUrl: string;
  gwRrpUsd: number;
  cheapestListing: {
    currentPrice: number;
    discountPct: number;
    storeName: string;
    storeSlug: string;
    listingId: string;
    inStock: boolean;
    lastCheckedAt: string;
    isAllTimeLow: boolean;    // computed in query layer, not component
  } | null;
};
```

- [ ] Configure `web/lib/prisma.ts` — singleton on `globalThis`
- [ ] Configure `web/lib/data.ts` — **`unstable_cache` + `React.cache()` combo** (critical: `React.cache()` alone does not respond to `revalidateTag()`):

```typescript
// web/lib/data.ts
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { prisma } from './prisma';
import type { ProductWithListings, GetDealsOptions } from './types';

// unstable_cache: persists across requests, responds to revalidateTag()
// cache: deduplicates within a single render pass (React Server Components)
export const getProduct = cache(
  unstable_cache(
    async (slug: string): Promise<ProductWithListings | null> => {
      return prisma.product.findUnique({
        where: { slug, is_active: true },
        include: {
          listings: {
            include: { store: true },
            orderBy: { current_price: 'asc' },
          },
        },
      });
    },
    ['product'],
    { revalidate: 14400, tags: (slug) => [`product-${slug}`] }
  )
);

export const getDeals = cache(
  unstable_cache(
    async (opts: GetDealsOptions = {}) => { /* ... */ },
    ['deals'],
    { revalidate: 3600, tags: () => ['deals'] }
  )
);
```

- [ ] Set up Vitest: `npm install -D vitest @vitejs/plugin-react`
- [ ] Write tests for `/go/` route before wiring any affiliate programs:

```typescript
// web/app/go/[store]/[id]/route.test.ts
describe('GET /go/[store]/[id]', () => {
  it('returns 302 to affiliate URL for valid listing');
  it('returns 302 to homepage when listing has no affiliate URL');
  it('returns 400 for invalid UUID format');
  it('does not match listing to wrong store slug');
  it('sets Referrer-Policy: no-referrer header');
  it('sets Cache-Control: no-store header');
});
```

- [ ] Build `<ProductCard>` (`components/server/ProductCard.tsx`) — receives `ProductCardData` (pre-serialized, no Prisma types)
- [ ] Build `<FactionFilter>` (`components/client/FactionFilter.tsx`) — `'use client'`, receives plain serialized props only
- [ ] Build `<PriceComparisonTable>` (`components/server/PriceComparisonTable.tsx`) — receives `SerializedListing[]`

**Files:**
- `web/tsconfig.json`
- `web/.eslintrc.json`
- `web/lib/types.ts`
- `web/lib/prisma.ts`
- `web/lib/data.ts`
- `web/components/server/ProductCard.tsx`
- `web/components/server/PriceComparisonTable.tsx`
- `web/components/client/FactionFilter.tsx`
- `web/app/go/[store]/[id]/route.test.ts`

#### Week 5 — Core Pages (7 routes)

- [ ] **`app/error.tsx`** — global error boundary (required before any data-fetching page)
- [ ] **Homepage** `app/(marketing)/page.tsx` — ISR `revalidate=3600`:
  - `error.tsx` + `loading.tsx`
  - "Daily Drops" — products with largest price drop in last 24h
  - "Top Deals" — top 12 by `discount_pct` DESC, in stock only
  - "Featured Factions" — static curation (Space Marines, Necrons, Orks, Stormcast)
  - Affiliate disclosure footer banner
- [ ] **Product page** `app/product/[slug]/page.tsx` — ISR `revalidate=14400`:
  - `error.tsx` + `loading.tsx` + `not-found.tsx`
  - `generateStaticParams()` top 500 products; `dynamicParams = true`
  - `generateMetadata()` — dynamic title/description + canonical
  - `<PriceComparisonTable>` with serialized listings
  - `<ProductJsonLd>` (structured data — Phase 3, placeholder for now)
- [ ] **Deals page** `app/deals/page.tsx` — ISR `revalidate=3600`:
  - `error.tsx` + `loading.tsx`
  - `?window=24h` shows products with price drops in last 24h (replaces `/pricedrop/daily`)
  - `?window=7d` shows 7-day drops (replaces `/pricedrop/weekly`)
  - Default: all deals ≥5% off RRP sorted by `discount_pct` DESC
- [ ] **Faction page** `app/faction/[slug]/page.tsx` — ISR `revalidate=21600`:
  - `error.tsx` + `loading.tsx`
- [ ] **`/go/` affiliate redirect** `app/go/[store]/[id]/route.ts`:
  - `runtime = 'nodejs'`; `dynamic = 'force-dynamic'`
  - Validate UUID format before DB lookup
  - **Validate store slug matches listing** (prevents `/go/amazon/[miniature-market-id]`)
  - `void logClick(id, request)` — explicit `void` makes fire-and-forget intent clear, satisfies `no-floating-promises` linter
  - 302 with `Referrer-Policy: no-referrer` + `Cache-Control: no-store`
  - Click log: only `listing_id + clicked_at` (no IP, no UA)
- [ ] **Revalidation webhook** `app/api/revalidate/route.ts`:
  - Bearer token auth
  - Accept `{ productIds: string[] }`, call `revalidateTag('product-${id}')` per product
  - Return `{ revalidated: string[], failed: string[] }` so scraper can log failures
- [ ] **Search page** `app/search/page.tsx` — SSR:
  - `error.tsx` + `loading.tsx`
  - PostgreSQL `tsvector` on `name + faction + game_system`
  - Empty state: "No results for 'X'"

**Files:**
- `web/app/error.tsx`
- `web/app/(marketing)/page.tsx` + `error.tsx` + `loading.tsx`
- `web/app/product/[slug]/page.tsx` + `error.tsx` + `loading.tsx` + `not-found.tsx`
- `web/app/deals/page.tsx` + `error.tsx` + `loading.tsx`
- `web/app/faction/[slug]/page.tsx` + `error.tsx` + `loading.tsx`
- `web/app/go/[store]/[id]/route.ts`
- `web/app/api/revalidate/route.ts`
- `web/app/search/page.tsx` + `error.tsx` + `loading.tsx`

#### Week 6 — Deploy + Privacy

- [ ] Set up Vercel project, connect GitHub, configure env vars
- [ ] Configure custom domain `grimdealz.com`
- [ ] `app/robots.ts` — disallow `/go/`, `/api/`, `/admin/`
- [ ] Privacy policy page at `/privacy` (required before launch)
- [ ] Affiliate disclosure footer: "GrimDealz earns commissions from qualifying purchases via affiliate links. Prices verified via automated scraping every 4 hours."
- [ ] Write `CLAUDE.md` with project conventions. Include:

```markdown
## Click logging
Click events store only listing_id + clicked_at. No IP, no UA, no PII.
Analytics (geo, device) come from Plausible.

## hashIp (removed — not used)
No IP hashing needed; click_events contains no PII.

## Decimal serialization
Prisma returns Decimal objects. Always call .toNumber() in data.ts
before passing to components. Components receive plain numbers only.
Never pass Prisma types to Client Components.

## Cache invalidation
Use unstable_cache (not React.cache) for queries that must respond to
revalidateTag(). React.cache() only deduplicates within one render.
```

**Phase 2 Success Criteria:**
- 7 routes live at `grimdealz.com` with real prices
- `/go/` redirect logging clicks (listing_id only)
- Search working
- Vercel build passes on every push
- All 6 `/go/` route tests passing

---

### Phase 3 — SEO & Signature Features (Weeks 7–8)

**Goal:** SEO-optimized, signature features live, affiliate programs approved.

#### Week 7 — Price History + Tracker Pages

- [ ] Build `<PriceHistoryChart>` (`components/client/PriceHistoryChart.tsx`) — `'use client'`:
  - Receives serialized `{ date: string; price: number; storeName: string }[]` (no Prisma types)
  - 30d default toggle; 7d / 90d / all-time
  - "Tracking since [date]" label when history < 7 days
  - Gracefully handle data gaps
  - Simple first pass: one line per store, no 52-week low dashed line (add that in Phase 4 if users engage with chart)
  - Data via API route (avoids ISR staleness)
- [ ] Wire `<PriceHistoryChart>` into `/product/[slug]`
- [ ] Build **BattleforceTracker** `app/battleforce-tracker/page.tsx` — ISR `revalidate=3600`:
  - Query `products WHERE product_type = 'battleforce'`
  - Off-season: "Out of stock at all stores" state
- [ ] Build **CombatPatrolTracker** `app/combat-patrol-tracker/page.tsx` — ISR `revalidate=21600`
- [ ] Build `app/new-releases/page.tsx` — ISR `revalidate=7200`

#### Week 8 — SEO + Amazon + More Scrapers + Affiliate Applications

- [ ] **`<ProductJsonLd>`** (`components/server/ProductJsonLd.tsx`):
  - `Product` + `AggregateOffer` schema
  - `priceValidUntil` = 24h from `last_checked_at` (required for Google price-drop rich results)
  - Sanitize `<` → `\u003c` before `dangerouslySetInnerHTML` **(test this)**
  - `BreadcrumbList` on all pages
- [ ] **Dynamic sitemap** `app/sitemap.ts`:
  - `revalidate=3600`
  - Exclude `/go/`, `/api/`, `/admin/`
- [ ] **`generateMetadata()`** on all route pages with canonical URLs
- [ ] Single static OG image (not per-faction — no traffic yet to justify 40+ generated images)
- [ ] Add Noble Knight, Atomic Empire, Frontline Gaming scrapers
- [ ] Add **Amazon PA-API** scraper (site is now live; apply for Associates + PA-API access)
  - Use `python-amazon-paapi` library
  - Map ASIN → GW item number via title fuzzy match + manual lookup table
- [ ] Apply to all affiliate programs (requires live site URL):
  - ShareASale: Miniature Market, Discount Games Inc, Noble Knight
  - Amazon Associates: `grimdealz-20`
  - Impact: Frontline Gaming
  - Direct: Atomic Empire, Wargame Portal
- [ ] Submit to Google Search Console + Bing Webmaster Tools

**Files:**
- `web/components/client/PriceHistoryChart.tsx`
- `web/components/server/ProductJsonLd.tsx`
- `web/app/battleforce-tracker/page.tsx`
- `web/app/combat-patrol-tracker/page.tsx`
- `web/app/new-releases/page.tsx`
- `web/app/sitemap.ts`
- `scrapers/stores/noble_knight.py`
- `scrapers/stores/atomic_empire.py`
- `scrapers/stores/frontline_gaming.py`
- `scrapers/stores/amazon.py`

**Phase 3 Success Criteria:**
- All 10 routes live
- Price history charts rendering
- BattleforceTracker + CombatPatrolTracker live
- Structured data validates in Google Rich Results Test
- Sitemap indexed in Search Console
- Amazon + 3 stores affiliate applications submitted
- 5+ scrapers running every 4 hours

---

### Phase 4 — Growth (Weeks 9+)

**Goal:** Traffic compounding. Revenue flowing. Build from data, not speculation.

- [ ] **Monitor Search Console** — only build new routes when GSC shows impressions
- [ ] **`/store/[slug]`, `/game/[slug]`, `/category/[slug]`** — build only if GSC shows these query patterns getting impressions (deferred from Phase 3 per reviewer recommendation)
- [ ] **"GW Price Increase Tracker"** content page — high link-bait, community-sharing value
- [ ] **Reddit community engagement** — r/Warhammer, r/Warhammer40k, r/ageofsigmar
- [ ] **Google AdSense** — apply once monthly traffic exceeds 5K sessions
- [ ] Add P2 scrapers: J15 Games, Gamers Guild AZ
- [ ] Add Element Games (UK, 25% off, Awin affiliate):
  - Add `currency` column to `listings` at this point (not before)
  - Display GBP with `£` label, US/UK sections separate on product pages
- [ ] **Admin page** `app/admin/page.tsx` — build now that there's meaningful operational complexity:
  - Supabase Auth, single admin user
  - Scrape run history + unmatched listings queue
  - Click stats (30 days, by product and store)
- [ ] **Per-faction OG images** using `next/og` — build if social sharing becomes a meaningful traffic source
- [ ] **52-week low reference line** on `PriceHistoryChart` — add once enough price history data exists
- [ ] **Meilisearch migration** if search latency degrades or product count exceeds 10K
- [ ] **Price alerts infrastructure** — add `users` table and `price_alerts` table when auth is ready; add `user_id FK` to `click_events` at this point (not before)

---

## Acceptance Criteria

### Functional Requirements

- [ ] Homepage displays daily drops, top deals, featured factions with real prices
- [ ] Product pages show all retailer listings sorted by price with discount % vs GW RRP
- [ ] Price comparison table shows `last_checked_at` per listing
- [ ] Out-of-stock listings shown greyed out, not hidden
- [ ] `/go/[store]/[id]` redirects to correct affiliate URL
- [ ] Store slug in `/go/` URL is validated against listing (no cross-store redirects)
- [ ] Click events log only `listing_id + clicked_at` (no PII)
- [ ] Scrapers run every 4 hours; `price_history` writes only on price/stock change
- [ ] Search returns relevant results; zero-results empty state shown
- [ ] BattleforceTracker + CombatPatrolTracker live with current prices (Phase 3)
- [ ] Affiliate disclosure present on all pages with affiliate links

### Non-Functional Requirements

- [ ] Product pages Lighthouse Performance ≥85 on mobile
- [ ] `/go/` redirect completes in <100ms (redirect not blocked by DB write)
- [ ] Scrapers complete full run in <25 minutes
- [ ] `robots.txt` disallows `/go/`, `/api/`, `/admin/`
- [ ] All affiliate links use `rel="nofollow sponsored"`
- [ ] Structured data validates with 0 errors in Google Rich Results Test
- [ ] JSON-LD sanitizes `<` to `\u003c` — **covered by Vitest test**
- [ ] Sitemap includes all active product, faction pages

### Quality Gates

- [ ] TypeScript `strict: true` + `noUncheckedIndexedAccess: true` in `tsconfig.json`
- [ ] ESLint `no-floating-promises` — no unawaited async calls; use `void fn()` for intentional fire-and-forget
- [ ] Prisma client uses `globalThis` singleton
- [ ] `DATABASE_URL` uses `pgbouncer=true&connection_limit=1`
- [ ] All Prisma queries use `unstable_cache` (not just `React.cache`) for ISR revalidation compatibility
- [ ] `Prisma.Decimal` converted to `number` in `data.ts` before passing to components
- [ ] Client Components receive only serialized props (no Prisma types, no `Date` objects — use ISO strings)
- [ ] All sensitive env vars in Vercel/Railway secrets — never committed
- [ ] `.env.example` committed with all required keys, no values
- [ ] 6 Vitest tests for `/go/` route passing before applying to affiliate programs

---

## Success Metrics

| Metric | Month 3 | Month 6 | Month 12 |
|---|---|---|---|
| Monthly sessions | 3,000 | 20,000 | 80,000 |
| Products tracked | 800+ | 2,000+ | 2,000+ full catalog |
| Stores live | 2 | 5 | 10+ |
| Affiliate clicks/mo | 300 | 2,000 | 8,000 |
| Est. affiliate revenue | ~$71 | ~$504 | ~$2,128 |
| Display ad revenue | — | ~$200 | ~$800 |
| Total monthly | ~$100 | ~$700 | ~$3,000 |

> **Note (DHH):** New sites commonly sit in Google's indexing queue 3–6 months before organic traffic materializes regardless of content quality. Plan for $0 at Month 3, $100–200 at Month 6. The revenue projection math is correct; the timeline may not be.

---

## Dependencies & Prerequisites

### Before Writing Any Code

- [ ] Supabase account + project provisioned
- [ ] Vercel account + GitHub integration
- [ ] Railway/Render account for Python worker
- [ ] GitHub repository initialized (public = free unlimited Actions minutes)
- [ ] Domain `grimdealz.com` registered → Vercel
- [ ] Decisions D1–D6 answered
- [ ] Amazon Associates account created (PA-API approval requires this + 3 qualifying sales; start early)

### Phase 3 Dependencies

- [ ] Site live at `grimdealz.com` to apply to affiliate programs
- [ ] Amazon Associates account active (apply early; PA-API approval takes 1–3 days after qualifying sales)
- [ ] Google Search Console verified

### External Services

| Service | Required For | Free Tier |
|---|---|---|
| Supabase | DB | 500MB storage, 2 projects |
| Vercel | Frontend | 100GB bandwidth |
| Railway | Scrapers | ~$5/mo |
| GitHub Actions | Cron | Public repo = unlimited |
| Amazon Associates | PA-API | Must make 3 qualifying sales |
| ShareASale | MM, DGI, NK | Manual approval 1–2 weeks |
| Google Search Console | SEO | Free |

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Amazon PA-API approval delayed | Medium | Medium | Phase 1–2 ships without Amazon; add links manually to high-traffic Amazon listings as fallback |
| Retailer blocks scraper IP | High | Medium | Add proxy support to `BaseStore` when it actually happens (not before) |
| GW item number absent from retailer page | Medium | Medium | Fuzzy name matching fallback; unmatched listings visible via Prisma Studio |
| ShareASale approval delayed | Low | Medium | Ship Phase 3 with placeholder `/go/` links; swap tags on approval |
| Supabase 500MB free tier hit | Medium | Low | Write-on-change reduces `price_history` volume; upgrade to $25/mo if needed |
| ISR + scraper clock drift (up to 8h) | High | Low | `last_checked_at` display + on-demand ISR webhook closes most of the gap |
| Thin content Google penalty | Medium | High | Every product page has real price data, history chart, multi-store comparison — not just template text |
| `React.cache()` without `unstable_cache` | **Done** | **Critical** | Fixed in plan: all queries use `unstable_cache` + `React.cache()` combo |

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://...db.[ref].supabase.co:5432/postgres

# Amazon PA-API (Phase 3)
AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=
AMAZON_PARTNER_TAG=grimdealz-20

# Affiliate Tags
AFFILIATE_MINIATURE_MARKET=       # ShareASale publisher ID
AFFILIATE_DISCOUNT_GAMES_INC=     # ShareASale publisher ID
AFFILIATE_NOBLE_KNIGHT=           # ShareASale publisher ID
AFFILIATE_FRONTLINE_GAMING=       # Impact publisher ID
AFFILIATE_ATOMIC_EMPIRE=          # Direct tracking param

# ISR Revalidation
REVALIDATE_SECRET=                # Random UUID, shared between scraper + Next.js

# App
NEXT_PUBLIC_SITE_URL=https://grimdealz.com
ADMIN_SECRET=                     # Supabase admin service role key (Phase 4)

# Note: No IP_HASH_SALT — click_events stores no PII
# Note: No PROXY_URL — add if a retailer actually blocks the scraper
# Note: No SLACK_WEBHOOK_URL — GitHub Actions email on failure is sufficient
```

---

## Future Considerations

- **Per-faction OG images** — add in Phase 4 if social sharing drives traffic
- **52-week low line on price chart** — add after enough history data accumulates
- **`/store/[slug]`, `/game/[slug]`, `/category/[slug]`** — build in Phase 4 when GSC shows impressions
- **User accounts + price alerts** — design `price_alerts` + `users` tables when auth is ready; add `user_id FK` to `click_events` at that point
- **Meilisearch/Typesense** — at >10K products or search latency >300ms
- **UK expansion** — add `listings.currency` column when Element Games onboards
- **Price history cleanup cron** — add when Supabase storage actually approaches limits (unlikely in year 1)
- **ML product matching** — replace fuzzy matching for unmatched listings
- **Mobile app** — React Native + same Supabase backend

---

## Documentation Plan

- [ ] `CLAUDE.md` — conventions: cache strategy, Decimal serialization, click logging, `void fn()` pattern
- [ ] `scrapers/README.md` — how to add a new store
- [ ] `web/README.md` — local dev, Prisma migration workflow, Vercel deploy
- [ ] `/privacy` page — affiliate disclosure, click event data (listing_id only), retention

---

## References & Research

### Best Practices Applied

- `unstable_cache` + `React.cache()` combo for ISR-compatible queries
- Prisma two-URL pattern: `DATABASE_URL` pooled (6543) + `DIRECT_URL` direct (5432)
- `Prisma.Decimal` → `number` serialization at data layer boundary
- Prisma `globalThis` singleton (prevents pool exhaustion in Next.js dev)
- `void fn()` for fire-and-forget async (satisfies `no-floating-promises`, makes intent clear)
- `StockStatus` + `ProductType` Prisma enums (prevents string inconsistency from scrapers)
- `components/server/` + `components/client/` directory split (enforces RSC discipline)
- `unstable_cache` tags: `(slug) => ['product-${slug}']` for per-product invalidation
- JSON-LD `<` → `\u003c` sanitization — tested with Vitest
- `priceValidUntil` in AggregateOffer — required for Google price-drop rich results
- `uv` + `astral-sh/setup-uv@v4` for GitHub Actions Python deps
- `playlist install chromium --with-deps` for Playwright on GH Actions runners

### External Documentation

- [Next.js ISR + unstable_cache](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Next.js Sitemap API](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Prisma + Supabase Setup](https://www.prisma.io/docs/orm/overview/databases/supabase)
- [JSON-LD in Next.js App Router](https://nextjs.org/docs/app/guides/json-ld)
- [Schema.org AggregateOffer](https://schema.org/AggregateOffer)
- [Amazon PA-API](https://webservices.amazon.com/paapi5/documentation/)

### Spec Document

- `GrimDealz_Spec.docx` — v1.0 original spec, project root

---

## Review Changes Applied (v1.0 → v1.1)

| Change | Source |
|---|---|
| `React.cache()` → `unstable_cache` + `React.cache()` combo (ISR revalidation was broken) | Kieran |
| TypeScript strict mode + `noUncheckedIndexedAccess` added to Week 4 | Kieran |
| `stock_status` changed from `text` to `StockStatus` Prisma enum | Kieran |
| `product_type` enum inconsistency resolved in ERD | Kieran |
| `web/lib/types.ts` with `SerializedListing`, `GetDealsOptions`, `ProductCardData` | Kieran |
| `Prisma.Decimal` → `number` serialization strategy documented | Kieran |
| `components/server/` + `components/client/` directory split | Kieran |
| `error.tsx` + `loading.tsx` added to all route segments | Kieran |
| Vitest tests for `/go/` route added to Week 4 | Kieran |
| ESLint `no-floating-promises` + `no-explicit-any` configuration | Kieran |
| `/go/` store slug validation against listing | Kieran |
| `void logClick()` explicit pattern documented | Kieran |
| `shared/schemas/price_result.schema.json` (Python/TS contract) | Kieran |
| `listings.gw_rrp_usd` removed (duplicate of `products.gw_rrp_usd`) | Simplicity |
| `listings.currency` removed (YAGNI — add with UK expansion) | Simplicity |
| `click_events` simplified to `listing_id + clicked_at` only | Simplicity + DHH |
| `IP_HASH_SALT` + IP hashing removed entirely (no PII stored) | Simplicity + DHH |
| Amazon moved from Phase 1 → Phase 3 (PA-API requires live site) | Simplicity |
| `/pricedrop/daily` + `/pricedrop/weekly` collapsed into `/deals?window=` | Simplicity |
| `/store/[slug]`, `/game/[slug]`, `/category/[slug]` deferred to Phase 4 | Simplicity + DHH |
| Admin page deferred to Phase 4 (use Prisma Studio until then) | Simplicity + DHH |
| Slack webhook removed from GitHub Actions (email is sufficient) | Simplicity |
| `PROXY_URL` removed (solve if/when a retailer blocks) | Simplicity |
| Price history cleanup cron deferred (no pressure for 2 years) | Simplicity |
| OG images simplified to single static image for v1 | Simplicity |
| Nullable `user_id` in future schema notes removed | Simplicity + DHH |
| Revenue timeline caveat added (Google sandbox effect) | DHH |
| Prisma vs Supabase JS client trade-off noted in architecture | DHH |

---

*GrimDealz Build Plan — v1.1 — 2026-02-22*
*Generated with Claude Code (claude-sonnet-4-6)*
