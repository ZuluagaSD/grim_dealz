/**
 * GrimDealz — Prisma seed
 *
 * Seeded data:
 *   - stores: all US (+ future UK) retailers with affiliate metadata
 *
 * Products are NOT seeded here.
 * The `scrapers/seed_catalog.py` script handles the one-time GW catalog import.
 *
 * Run: npx prisma db seed
 *      (configured in package.json > prisma.seed)
 *
 * Idempotent: uses upsert on slug so running twice is safe.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─────────────────────────────────────────
// Store data
// isActive=true  → scraper is built and running
// isActive=false → store planned but scraper not yet implemented
// Phases: 1 = P0 scrapers, 3 = Phase 3 scrapers, 4 = Phase 4 UK
// ─────────────────────────────────────────

const stores = [
  // ── Phase 1 (P0) ─────────────────────────────────────────────────
  {
    slug: 'miniature-market',
    name: 'Miniature Market',
    baseUrl: 'https://www.miniaturemarket.com',
    region: 'US',
    affiliateNetwork: 'shareasale',
    affiliateTag: null, // fill in after ShareASale approval
    commissionPct: 8.0,
    typicalDiscountPct: 20.0,
    isActive: true,
  },
  {
    slug: 'discount-games-inc',
    name: 'Discount Games Inc',
    baseUrl: 'https://www.discountgamesinc.com',
    region: 'US',
    affiliateNetwork: 'shareasale',
    affiliateTag: null,
    commissionPct: 8.0,
    typicalDiscountPct: 20.0,
    isActive: true,
  },

  // ── Phase 3 ───────────────────────────────────────────────────────
  {
    slug: 'noble-knight',
    name: 'Noble Knight Games',
    baseUrl: 'https://www.nobleknight.com',
    region: 'US',
    affiliateNetwork: 'shareasale',
    affiliateTag: null,
    commissionPct: 8.0,
    typicalDiscountPct: 15.0,
    isActive: false,
  },
  {
    slug: 'atomic-empire',
    name: 'Atomic Empire',
    baseUrl: 'https://www.atomicempire.com',
    region: 'US',
    affiliateNetwork: 'direct',
    affiliateTag: null,
    commissionPct: null,
    typicalDiscountPct: 20.0,
    isActive: false,
  },
  {
    slug: 'frontline-gaming',
    name: 'Frontline Gaming',
    baseUrl: 'https://store.frontlinegaming.org',
    region: 'US',
    affiliateNetwork: 'impact',
    affiliateTag: null,
    commissionPct: 8.0,
    typicalDiscountPct: 20.0,
    isActive: true,
  },
  {
    slug: 'amazon',
    name: 'Amazon',
    baseUrl: 'https://www.amazon.com',
    region: 'US',
    affiliateNetwork: 'amazon',
    affiliateTag: 'grimdealz-20',
    commissionPct: 3.0,
    typicalDiscountPct: 15.0,
    isActive: false, // requires live site + qualifying sales for PA-API
  },
  {
    slug: 'gamenerdz',
    name: 'GameNerdz',
    baseUrl: 'https://www.gamenerdz.com',
    region: 'US',
    affiliateNetwork: 'shareasale',
    affiliateTag: null,
    commissionPct: 8.0,
    typicalDiscountPct: 20.0,
    isActive: true,
  },
  {
    slug: 'cool-stuff-inc',
    name: 'Cool Stuff Inc',
    baseUrl: 'https://www.coolstuffinc.com',
    region: 'US',
    affiliateNetwork: 'direct',
    affiliateTag: null,
    commissionPct: null,
    typicalDiscountPct: 15.0,
    isActive: false,
  },
  {
    slug: 'tower-games',
    name: 'Tower Games',
    baseUrl: 'https://www.tower-games.com',
    region: 'US',
    affiliateNetwork: 'direct',
    affiliateTag: null,
    commissionPct: null,
    typicalDiscountPct: 10.0,
    isActive: false,
  },
  {
    slug: 'game-kastle',
    name: 'Game Kastle',
    baseUrl: 'https://www.gamekastle.com',
    region: 'US',
    affiliateNetwork: 'direct',
    affiliateTag: null,
    commissionPct: null,
    typicalDiscountPct: 10.0,
    isActive: false,
  },

] as const

async function main() {
  console.log('🌱 Seeding stores...')

  for (const store of stores) {
    await prisma.store.upsert({
      where: { slug: store.slug },
      update: {
        name: store.name,
        baseUrl: store.baseUrl,
        region: store.region,
        affiliateNetwork: store.affiliateNetwork,
        affiliateTag: store.affiliateTag ?? null,
        commissionPct: store.commissionPct ?? null,
        typicalDiscountPct: store.typicalDiscountPct ?? null,
        isActive: store.isActive,
      },
      create: {
        slug: store.slug,
        name: store.name,
        baseUrl: store.baseUrl,
        region: store.region,
        affiliateNetwork: store.affiliateNetwork,
        affiliateTag: store.affiliateTag ?? null,
        commissionPct: store.commissionPct ?? null,
        typicalDiscountPct: store.typicalDiscountPct ?? null,
        isActive: store.isActive,
      },
    })
    console.log(`  ✓ ${store.name} (${store.region}) — ${store.isActive ? 'active' : 'inactive'}`)
  }

  const count = await prisma.store.count()
  console.log(`\n✅ Done. ${count} stores in DB.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
