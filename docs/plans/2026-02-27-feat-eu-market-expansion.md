---
title: GrimDealz — EU Market Expansion Plan
type: feat
date: 2026-02-27
status: draft
depends-on: Phase 3 (SEO & Features) substantially complete
---

# GrimDealz — EU Market Expansion Plan

> Expand GrimDealz from a US-only Warhammer price comparison site to serve
> the European market (EU + UK). This is the detailed plan for what was
> previously a single bullet point in Phase 4: "UK expansion (Element Games,
> Wayland Games)".

---

## Why the EU Market?

1. **Games Workshop is a UK company** — the Warhammer hobby is arguably more
   entrenched in Europe than the US. The UK and Germany are GW's two largest
   markets after the US.

2. **No EU price comparison site exists** — the same uncontested SEO
   opportunity we identified for the US market exists (and is arguably larger)
   for EU hobby terms in English, German, French, Spanish, and Italian.

3. **GW's EUR prices are ~10-15% above fair FX conversion** — EU hobbyists
   have even more reason to shop around than US buyers. A box that costs £30
   GBP in the UK is priced at €37.50 EUR — roughly 10-15% more than the
   actual exchange rate would suggest.

4. **Third-party EU/UK retailers offer 15-25% off GW RRP** — the same
   affiliate arbitrage exists: compare prices → redirect via `/go/` → earn
   commission.

5. **Traffic diversification** — not dependent on a single market or Google
   region.

---

## Stores to Crawl

### Tier 1 — Launch Stores (UK)

These are the most established, highest-volume Warhammer discount retailers
in Europe. Both have affiliate programs, massive catalogs, and strong
community reputation. UK stores ship EU-wide and are where most English-
speaking European hobbyists already shop.

| Store | Location | Discount | Affiliate | Currency | Free Shipping | Priority |
|-------|----------|----------|-----------|----------|---------------|----------|
| **Element Games** | Stockport, UK | 15-25% off GW RRP | Awin (7% commission) | GBP | £80+ UK | P0 |
| **Wayland Games** | Hockley, Essex, UK | 20% off GW RRP | Own program (5% commission, 30-day cookie) | GBP | £20+ UK | P0 |

**Why these first:**
- Already identified in seed.ts (inactive, Phase 4)
- Both have established affiliate programs (Awin + Wayland's own)
- Largest catalogs of any EU/UK third-party retailers
- English-language sites — no localization needed for v1
- Community consensus: these two cover 80%+ of UK/EU online discount buying

### Tier 2 — UK Expansion (Month 2)

| Store | Location | Discount | Affiliate | Currency | Free Shipping | Priority |
|-------|----------|----------|-----------|----------|---------------|----------|
| **Firestorm Games** | Cardiff, UK | 15-20% | Own program (6-8% commission) | GBP | £60+ UK | P1 |
| **Goblin Gaming** | UK | Up to 20% | None (shut down program) | GBP | £75+ UK | P1 |
| **Alchemists Workshops** | Winsford, UK | 20-25% | TBD | GBP | £50-70+ UK | P2 |
| **Mighty Lancer Games** | Bridlington, UK | 15-20% | TBD | GBP | TBD | P2 |
| **The Outpost** | UK | 15-20% | TBD | GBP | TBD | P2 |

### Tier 3 — EU-Native Stores (Month 3-4)

These ship within the EU without customs complications (post-Brexit, UK→EU
orders can incur VAT + customs charges above €150). Critical for users who
want to avoid UK import headaches.

| Store | Country | Discount | Affiliate | Currency | Free Shipping | Priority |
|-------|---------|----------|-----------|----------|---------------|----------|
| **Kutami** | Bremen, Germany | 20% | TBD (likely direct) | EUR | €100+ | P1 |
| **Bombcat Hobby** | Roma, Italy | 20% | TBD | EUR | TBD | P2 |
| **MiniHobby** | Rotterdam, Netherlands | 15% | TBD | EUR | TBD | P2 |
| **Goblin Trader** | Spain (multi-city) | 15% | TBD | EUR | €70 Spain, €150 EU | P2 |
| **Oupi.eu** | Sallanches, France | Up to 20% | TBD | EUR | €150 EU | P2 |
| **Figurines Wargame** | Trepot, France | 10% | TBD | EUR | €100 | P3 |
| **Siren Games** | Wien, Austria | 10% | TBD | EUR | €100 | P3 |
| **SuperSerie.eu** | Warsaw, Poland | Varies | TBD | EUR | €99 EU | P3 |

**Why Kutami is P1:** 20% discount, ships all over Europe from Germany (no
Brexit customs), large catalog, same-day shipping, well-reviewed in the
community.

### Summary: Crawl Priority

```
Month 1:  Element Games (UK) + Wayland Games (UK)           — GBP
Month 2:  Goblin Gaming + Firestorm Games (UK)              — GBP
Month 3:  Kutami (Germany)                                   — EUR
Month 4:  Bombcat Hobby + MiniHobby + Goblin Trader (EU)   — EUR
Future:   Figurines Wargame + Siren Games + others          — EUR
```

---

## Technical Changes Required

### 1. Multi-Currency Support (Database)

The current schema stores all prices in USD only. EU expansion requires
supporting GBP and EUR.

#### Schema Changes

```prisma
// Add to schema.prisma

enum Currency {
  USD
  GBP
  EUR
}

model Store {
  // ... existing fields ...
  currency  Currency @default(USD)  // NEW: store's native currency
}

model Listing {
  // ... existing fields ...
  currency  Currency @default(USD)  // NEW: price currency for this listing
}

model PriceHistory {
  // ... existing fields ...
  currency  Currency @default(USD)  // NEW: preserve currency at time of record
}
```

**Migration strategy:** Add `currency` with `@default(USD)` so all existing
US data remains valid without a backfill.

#### GW RRP: Multi-Currency Reference Prices

Currently `products.gw_rrp_usd` is the single source of truth for discount
calculation. For EU expansion we need GW RRP in GBP and EUR too.

**Option A — Add columns to `products`:**
```prisma
model Product {
  gwRrpUsd  Decimal @db.Decimal(10, 2)
  gwRrpGbp  Decimal? @db.Decimal(10, 2)  // NEW
  gwRrpEur  Decimal? @db.Decimal(10, 2)  // NEW
}
```

**Option B — Separate `product_prices` table:**
```prisma
model ProductPrice {
  id         String   @id @default(uuid())
  productId  String
  currency   Currency
  gwRrp      Decimal  @db.Decimal(10, 2)
  product    Product  @relation(fields: [productId], references: [id])

  @@unique([productId, currency])
}
```

**Recommendation: Option A.** GW only has 3 regional price points (USD, GBP,
EUR). A separate table is overengineering for 3 nullable columns. Nullable
because we may not have GBP/EUR RRP for every product initially — the scraper
can backfill them from the GW webstore regional variants.

#### Discount Calculation Update

Currently in the dagster repo (`db.py`):
```python
discount_pct = (gw_rrp_usd - current_price) / gw_rrp_usd * 100
```

Must become currency-aware:
```python
def compute_discount(gw_rrp: Decimal, current_price: Decimal) -> Decimal:
    """Currency-agnostic: both values must be in the same currency."""
    if gw_rrp <= 0:
        return Decimal(0)
    return (gw_rrp - current_price) / gw_rrp * 100
```

The scraper selects the correct RRP column based on the store's currency.

### 2. Frontend: Currency Display

#### Price Formatting

Replace hardcoded `$` with currency-aware formatting:

```typescript
// web/lib/format.ts (NEW)
const CURRENCY_CONFIG: Record<string, { symbol: string; locale: string }> = {
  USD: { symbol: '$', locale: 'en-US' },
  GBP: { symbol: '£', locale: 'en-GB' },
  EUR: { symbol: '€', locale: 'en-DE' },
}

export function formatPrice(amount: number, currency: string): string {
  const config = CURRENCY_CONFIG[currency]
  if (!config) return `$${amount.toFixed(2)}`
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
```

#### SerializedListing Type Update

```typescript
export type SerializedListing = {
  // ... existing fields ...
  currency: string  // NEW: "USD" | "GBP" | "EUR"
}
```

#### Product Page: Regional Sections

Product pages should group listings by currency region:

```
US Retailers                    UK/EU Retailers
┌─────────────────────────┐    ┌──────────────────────────┐
│ Miniature Market  $38.25│    │ Element Games    £26.25  │
│ GameNerdz        $38.50│    │ Wayland Games    £28.00  │
│ Discount Games   $39.00│    │ Kutami           €32.50  │
└─────────────────────────┘    └──────────────────────────┘
GW RRP: $47.50                  GW RRP: £32.50 / €37.50
```

**Key UX decision:** Do NOT convert currencies. Show each listing in its
native currency with the corresponding regional GW RRP. Users know their own
currency — cross-currency conversion introduces confusion and inaccuracy
(exchange rates fluctuate). Instead, show discount percentage which is
currency-agnostic.

### 3. Scraper Infrastructure (dagster repo)

#### New Store Scrapers

Each EU/UK store needs a scraper in the dagster repo following the existing
`BaseStore` pattern:

```
dagster/scrapers/grim_dealz/grim_dealz/stores/
├── element_games.py       # Tier 1 — P0
├── wayland_games.py       # Tier 1 — P0
├── goblin_gaming.py       # Tier 2 — P1
├── firestorm_games.py     # Tier 2 — P1
├── kutami.py              # Tier 3 — P1
├── mighty_lancer.py       # Tier 2 — P2
├── the_outpost.py         # Tier 2 — P2
├── bombcat_hobby.py       # Tier 3 — P2
├── minihobby.py           # Tier 3 — P2
└── goblin_trader.py       # Tier 3 — P2
```

#### GW Item Number Matching

The key challenge: EU/UK stores may use different product codes than US
stores. Matching strategies:

1. **GW Item Number** (preferred) — e.g., `99-12-01`. Many EU stores display
   this. Same across all regions.
2. **EAN/Barcode** — 13-digit barcode. Standardized globally. The
   `price_result.schema.json` already supports this pattern.
3. **Product Name Fuzzy Match** — fallback for stores that display neither.
   Use the existing fuzzy matching with a manual correction table.

The shared JSON schema already supports both formats:
```json
"gw_item_number": {
  "pattern": "^[0-9]{2,3}-[0-9]{2,3}(-[0-9]{2})?$|^[0-9]{10,13}$"
}
```

#### GW RRP Scraper (New)

Need a one-time + periodic scraper for GW's own webstore to capture regional
RRPs:

```python
# dagster/scrapers/grim_dealz/grim_dealz/stores/gw_webstore.py
# NOT a store we list — just a reference price scraper
# Scrape warhammer.com with region selector:
#   - warhammer.com/en-US → USD RRP (already have this)
#   - warhammer.com/en-GB → GBP RRP
#   - warhammer.com/en-EU → EUR RRP
# Updates: products.gw_rrp_gbp, products.gw_rrp_eur
# Frequency: weekly (GW prices don't change often)
```

### 4. Shared Schema Update

```json
// shared/schemas/price_result.schema.json
{
  "properties": {
    "currency": {
      "type": "string",
      "enum": ["USD", "GBP", "EUR"],
      "default": "USD"
    }
  }
}
```

### 5. Seed Data Update

```typescript
// web/prisma/seed.ts — activate EU/UK stores

// Tier 1 — UK Launch
{
  slug: 'element-games',
  name: 'Element Games',
  baseUrl: 'https://elementgames.co.uk',
  region: 'UK',
  currency: 'GBP',
  affiliateNetwork: 'awin',
  affiliateTag: '', // to be filled after Awin approval
  commissionPct: 7.0,
  typicalDiscountPct: 20.0,
  isActive: true,
},
{
  slug: 'wayland-games',
  name: 'Wayland Games',
  baseUrl: 'https://www.waylandgames.co.uk',
  region: 'UK',
  currency: 'GBP',
  affiliateNetwork: 'direct', // Wayland runs their own program
  affiliateTag: '', // to be filled after approval
  commissionPct: 5.0,
  typicalDiscountPct: 20.0,
  isActive: true,
},

// Tier 3 — EU Native
{
  slug: 'kutami',
  name: 'Kutami',
  baseUrl: 'https://www.kutami.de',
  region: 'EU',
  currency: 'EUR',
  affiliateNetwork: 'direct',
  affiliateTag: '',
  commissionPct: 0, // TBD — may not have affiliate program
  typicalDiscountPct: 20.0,
  isActive: false, // activate when scraper is ready
},
```

### 6. ISR Cache & Routing

No new routes needed. Existing routes handle EU data automatically:
- `/product/[slug]` — already shows all listings for a product; just needs
  regional grouping in the UI
- `/deals` — `discount_pct` is currency-agnostic, so deals sort correctly
- `/go/[store]/[id]` — already works for any store

**One addition:** Region filter on deals/faction pages:
```
/deals?region=us    → US stores only
/deals?region=uk    → UK stores only
/deals?region=eu    → EU stores only
/deals              → all (default)
```

### 7. SEO Considerations

#### Short-term (English-only)

- Product pages naturally rank for UK/EU search queries because they'll
  contain UK/EU store names and GBP/EUR prices
- Add `hreflang` tags if we ever launch localized versions
- Structured data: `AggregateOffer` should include `priceCurrency` per offer
  (already part of Schema.org spec)

#### Medium-term (Localization)

Not in scope for this plan, but worth noting: if GSC shows significant
impressions from de-DE, fr-FR, etc., consider:
- `/de/` prefix routes with German-language UI
- German product names (GW publishes these)
- This is a separate plan — do NOT build this speculatively

---

## Implementation Phases

### EU Phase 1 — Foundation (Weeks 1-2)

**Goal:** Multi-currency schema live. Element Games + Wayland Games scrapers
running. GBP prices appearing on product pages.

#### Week 1 — Schema + GW RRP

- [ ] Prisma migration: add `Currency` enum, `currency` column to `stores`,
      `listings`, `price_history`
- [ ] Add `gwRrpGbp` and `gwRrpEur` nullable columns to `products`
- [ ] Update `toNum()` and serialization in `data.ts` to include currency
- [ ] Create `web/lib/format.ts` with `formatPrice()` helper
- [ ] Update `SerializedListing` type with `currency` field
- [ ] Update `ProductCardData` type — cheapest listing needs currency context
- [ ] Build GW webstore RRP scraper (GBP + EUR) in dagster repo
- [ ] Run GW RRP scraper to backfill `gwRrpGbp` / `gwRrpEur` for all
      products

#### Week 2 — Store Scrapers + UI

- [ ] Implement `element_games.py` scraper in dagster repo
- [ ] Implement `wayland_games.py` scraper in dagster repo
- [ ] Update seed.ts — activate Element Games + Wayland Games
- [ ] Update `PriceComparisonTable` — group by currency region
- [ ] Update product page — show US and UK/EU sections separately
- [ ] Update `PriceHistoryChart` — currency label on Y-axis
- [ ] Update JSON-LD structured data — `priceCurrency` per offer
- [ ] Apply to Awin for Element Games affiliate program
- [ ] Apply to Wayland Games affiliate program
- [ ] Test end-to-end: scrape → DB → product page → `/go/` redirect

### EU Phase 2 — UK Expansion (Weeks 3-4)

**Goal:** 4 UK stores live. Region filter on deals page.

- [ ] Implement `goblin_gaming.py` scraper
- [ ] Implement `firestorm_games.py` scraper
- [ ] Add region filter to `/deals` and `/faction/[slug]` pages
- [ ] Update seed.ts with Goblin Gaming + Firestorm Games
- [ ] Research and apply for affiliate programs (Goblin Gaming, Firestorm)
- [ ] Monitor affiliate approval status for Element Games + Wayland

### EU Phase 3 — EU-Native Stores (Weeks 5-8)

**Goal:** EUR prices from stores shipping within the EU. Users can compare
without worrying about Brexit customs.

- [ ] Implement `kutami.py` scraper (P1 — Germany, EUR)
- [ ] Implement `bombcat_hobby.py` scraper (P2 — Italy, EUR)
- [ ] Implement `minihobby.py` scraper (P2 — Netherlands, EUR)
- [ ] Implement `goblin_trader.py` scraper (P2 — Spain, EUR)
- [ ] Update seed.ts with all EU stores
- [ ] Contact stores about affiliate/referral programs
- [ ] Add shipping cost context to UI (e.g., "Free shipping over €100")
- [ ] Monitor GSC for EU search query impressions

### EU Phase 4 — Optimization & Growth

**Goal:** Iterate based on real data.

- [ ] Add remaining Tier 2 UK stores (Mighty Lancer, The Outpost) if traffic
      justifies
- [ ] Add remaining EU stores (Figurines Wargame, Siren Games) if traffic
      justifies
- [ ] Consider localized routes (`/de/`, `/fr/`) if GSC shows demand
- [ ] Consider EU-specific landing pages ("Cheapest Warhammer in Germany")
- [ ] Build `/store/[slug]` pages for EU stores with high click-through
- [ ] Price alert feature — useful for EU users tracking cross-border deals

---

## Decisions Required Before Implementation

| # | Decision | Recommended Default | Impact |
|---|----------|---------------------|--------|
| E1 | **Currency display: convert or native?** | Native (show £/€ as-is, no FX conversion) | Avoids stale exchange rates; discount % is currency-agnostic |
| E2 | **Product page layout: merged or split tables?** | Split by region (US / UK / EU) with separate RRP headers | Clearest UX; avoids mixing $ and £ in one table |
| E3 | **"Cheapest" logic: cross-currency?** | No — cheapest per-region only; homepage shows user's region | Cross-currency comparison is misleading without live FX |
| E4 | **Region detection** | Default to US; manual toggle (US/UK/EU) stored in cookie | Geo-IP is fragile; let users choose; remember preference |
| E5 | **GW RRP columns vs table** | Columns on `products` (Option A) | Only 3 currencies; join overhead not worth it |
| E6 | **Stores without affiliate programs** | List them anyway (direct URL); revenue = $0 but value = user trust | Completeness > monetization for new market entry |
| E7 | **Post-Brexit shipping warnings** | Show tooltip: "UK stores may charge customs for EU delivery over €150" | Transparency builds trust |

---

## Affiliate Program Details

### Confirmed Programs

| Store | Network | Commission | Cookie | Apply At |
|-------|---------|------------|--------|----------|
| Element Games | Awin | ~7% | TBD | elementgames.co.uk/affiliation |
| Wayland Games | Own program | 5% | 30 days | waylandgames.co.uk/affiliate-program |

### Confirmed (Additional Research)

| Store | Network | Commission | Notes |
|-------|---------|------------|-------|
| Firestorm Games | Own program | 6-8% (scales with volume) | Monthly payouts, min £10; apply at firestormgames.co.uk/affiliates |

### To Research

| Store | Notes |
|-------|-------|
| Goblin Gaming | Shut down their affiliate program; list with direct URLs |
| Kutami | Likely no program — list with direct URLs |
| Bombcat Hobby | Contact directly |
| MiniHobby | Contact directly |
| Goblin Trader | Contact directly |
| Oupi.eu (France) | Up to 20% off, 5-star Trustpilot, ships EU; worth adding to Tier 3 |
| Alchemists Workshops (UK) | 20-25% off, same-day dispatch; worth adding to Tier 2 |

### Revenue Projection (EU Market)

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| EU Monthly sessions | 1,000 | 8,000 | 30,000 |
| Affiliate clicks/mo | 100 | 800 | 3,000 |
| Avg order (GBP) | £60 | £60 | £60 |
| Blended commission | 5% | 5.5% | 6% |
| Est. monthly revenue | ~£300 | ~£2,640 | ~£10,800 |

> **Caveat:** Same Google sandbox timeline applies. Realistic month 3 = £0-50.
> These are directional targets, not forecasts.

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| EU stores block scraper IP | Medium | Medium | Proxy support in BaseStore; EU stores generally less aggressive than US |
| GW item numbers differ by region | Low | Medium | EAN/barcode fallback; manual mapping table for mismatches |
| Brexit customs confusion for users | High | Low | Clear UI labels: "Ships from UK" vs "Ships from EU"; tooltip for customs |
| Low affiliate commission rates in EU | Medium | Low | List stores without programs anyway; focus on traffic growth first |
| Currency exchange rate display pressure | Medium | Low | Don't convert — show native prices + discount %. Explicit design decision |
| Element Games / Wayland affiliate rejection | Low | Medium | Apply with live US site showing real traffic; fallback to direct links |
| EU data protection (GDPR) | Medium | Medium | Already compliant: no PII in click_events; Plausible is GDPR-friendly; add cookie consent banner for EU users |

---

## What NOT to Build (Scope Boundaries)

- **No currency conversion** — show native prices only
- **No localized UI** (yet) — English only for v1; revisit if GSC shows demand
- **No EU-specific domain** (e.g., grimdealz.eu) — single domain, region toggle
- **No shipping calculator** — too complex, too many variables; link to store shipping pages
- **No VAT calculator** — varies by country; out of scope
- **No separate EU database** — same Supabase instance; currency column handles separation
- **No EU-specific scraper infrastructure** — same Dagster on zulu-pi; EU store scrape schedule aligns with existing 4h cycle

---

## Success Criteria

### EU Phase 1 Complete When:
- [ ] Element Games + Wayland Games scrapers running on 4h cycle
- [ ] GBP prices displaying correctly on product pages
- [ ] Product pages show US and UK sections separately
- [ ] `/go/` redirect works for UK stores
- [ ] Awin + Wayland affiliate applications submitted
- [ ] `formatPrice()` correctly handles USD, GBP, EUR
- [ ] Structured data includes `priceCurrency` per offer

### EU Expansion Complete When:
- [ ] 6+ EU/UK stores live with real prices
- [ ] GBP + EUR listings on 500+ products
- [ ] Region filter functional on deals page
- [ ] At least 2 EU-native stores (EUR) live
- [ ] Affiliate revenue flowing from at least 1 UK store
- [ ] GSC showing impressions for UK/EU search queries

---

## References

- [Warhamateur — Discount GW Retailers Guide](https://warhamateur.com/saving-money/discount-games-workshop-retailers/)
- [Element Games — Affiliate Program](https://elementgames.co.uk/affiliation)
- [Wayland Games — Affiliate Program](https://www.waylandgames.co.uk/affiliate-program)
- [Kutami — Warhammer 40K Store](https://www.kutami.de/en/games-workshop/warhammer-40k)
- [Goblin Gaming](https://www.goblingaming.co.uk/)
- [GW Trade Site — Price Adjustments](https://trade.games-workshop.com/article/price-adjustment/)

---

*GrimDealz EU Market Expansion Plan — v1.0 — 2026-02-27*
*Generated with Claude Code (claude-opus-4-6)*
