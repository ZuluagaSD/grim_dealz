import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { ProductType } from '@prisma/client'
import { prisma } from './prisma'
import type {
  ProductWithListings,
  GetDealsOptions,
  ProductCardData,
  DealItem,
  SerializedListing,
  SerializedPricePoint,
  FactionSummary,
} from './types'

export { ProductType }

// Stable map of game system slugs → display names (must match DB exactly)
export const GAME_SYSTEM_MAP: Record<string, string> = {
  'warhammer-40k': 'Warhammer 40,000',
  'age-of-sigmar': 'Age of Sigmar',
  'horus-heresy': 'The Horus Heresy',
  'the-old-world': 'The Old World',
}

// ─────────────────────────────────────────
// Serialization helpers
// Prisma Decimal objects serialize to strings when JSON-stringified by
// unstable_cache. Use toNum() everywhere — it handles Decimal, string, or number.
// ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNum(v: any): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v)
  if (v !== null && typeof v.toNumber === 'function') return v.toNumber() as number
  return Number(v)
}

function toIso(v: Date | string | null | undefined): string {
  if (!v) return new Date(0).toISOString()
  if (typeof v === 'string') return v
  return v.toISOString()
}

function serializeListing(
  listing: ProductWithListings['listings'][number]
): SerializedListing {
  return {
    id: listing.id,
    storeSlug: listing.store.slug,
    storeName: listing.store.name,
    currentPrice: toNum(listing.currentPrice),
    discountPct: toNum(listing.discountPct),
    inStock: listing.inStock,
    stockStatus: listing.stockStatus,
    affiliateUrl: listing.affiliateUrl,
    storeProductUrl: listing.storeProductUrl,
    lastCheckedAt: toIso(listing.lastCheckedAt),
  }
}

function productToCardData(
  product: ProductWithListings,
  isAllTimeLow = false
): ProductCardData {
  const cheapest = product.listings[0] // sorted by currentPrice asc
  return {
    slug: product.slug,
    name: product.name,
    faction: product.faction,
    imageUrl: product.imageUrl,
    gwRrpUsd: toNum(product.gwRrpUsd),
    cheapestListing: cheapest
      ? {
          currentPrice: toNum(cheapest.currentPrice),
          discountPct: toNum(cheapest.discountPct),
          storeName: cheapest.store.name,
          storeSlug: cheapest.store.slug,
          listingId: cheapest.id,
          inStock: cheapest.inStock,
          lastCheckedAt: toIso(cheapest.lastCheckedAt),
          isAllTimeLow,
        }
      : null,
  }
}

// ─────────────────────────────────────────
// Data fetchers
// unstable_cache: persists across requests, responds to revalidateTag()
// React.cache: deduplicates within a single render pass
// Tags are coarse-grained for Phase 2; scraper calls revalidateTag('deals')
// and revalidateTag('products') after each run.
// ─────────────────────────────────────────

export const getProduct = cache(
  unstable_cache(
    async (slug: string): Promise<ProductWithListings | null> => {
      return prisma.product.findUnique({
        where: { slug, isActive: true },
        include: {
          listings: {
            where: { store: { isActive: true } },
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
          },
        },
      })
    },
    ['product'],
    { revalidate: 14400, tags: ['products'] }
  )
)

export const getProductListings = cache(
  unstable_cache(
    async (slug: string): Promise<SerializedListing[]> => {
      const product = await prisma.product.findUnique({
        where: { slug, isActive: true },
        include: {
          listings: {
            where: { store: { isActive: true } },
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
          },
        },
      })
      if (!product) return []
      return product.listings.map(serializeListing)
    },
    ['product-listings'],
    { revalidate: 14400, tags: ['products'] }
  )
)

export const getDeals = cache(
  unstable_cache(
    async (opts: GetDealsOptions = {}): Promise<DealItem[]> => {
      const {
        minDiscountPct = 5,
        inStockOnly = true,
        limit = 48,
        offset = 0,
        faction,
        gameSystem,
        window,
      } = opts

      let droppedSince: Date | undefined
      if (window === '24h') {
        droppedSince = new Date(Date.now() - 24 * 60 * 60 * 1000)
      } else if (window === '7d') {
        droppedSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }

      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          ...(faction && { faction }),
          ...(gameSystem && { gameSystem }),
          listings: {
            some: {
              discountPct: { gte: minDiscountPct },
              ...(inStockOnly && { inStock: true }),
              store: { isActive: true },
              ...(droppedSince && { lastScraped: { gte: droppedSince } }),
            },
          },
        },
        include: {
          listings: {
            where: {
              discountPct: { gte: minDiscountPct },
              ...(inStockOnly && { inStock: true }),
              store: { isActive: true },
            },
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
            take: 1, // cheapest listing only for card display
          },
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      })

      // Sort by discount descending after fetch (Prisma can't orderBy relation field)
      const items = products
        .filter((p) => p.listings.length > 0)
        .sort((a, b) => {
          const aDisc = toNum(a.listings[0]?.discountPct) ?? 0
          const bDisc = toNum(b.listings[0]?.discountPct) ?? 0
          return bDisc - aDisc
        })
        .map((p) => ({
          ...productToCardData(p),
          gameSystem: p.gameSystem,
          productType: p.productType,
        }))

      return items
    },
    ['deals'],
    { revalidate: 3600, tags: ['deals'] }
  )
)

export const getTopDeals = cache(
  unstable_cache(
    async (limit = 12): Promise<DealItem[]> => {
      return getDeals({ limit, inStockOnly: true, minDiscountPct: 5 })
    },
    ['top-deals'],
    { revalidate: 3600, tags: ['deals'] }
  )
)

export const getFactionProducts = cache(
  unstable_cache(
    async (factionSlug: string, limit = 48): Promise<ProductCardData[]> => {
      // Convert kebab-case slug to title case faction name
      // "space-marines" → "Space Marines"
      const faction = factionSlug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

      const products = await prisma.product.findMany({
        where: { isActive: true, faction },
        include: {
          listings: {
            where: { inStock: true, store: { isActive: true } },
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
        take: limit,
      })

      return products.map((p) => productToCardData(p))
    },
    ['faction-products'],
    { revalidate: 21600, tags: ['products'] }
  )
)

export const getHomepageData = cache(
  unstable_cache(
    async () => {
      const [topDeals, dailyDrops] = await Promise.all([
        getTopDeals(12),
        getDeals({ window: '24h', limit: 8, inStockOnly: true }),
      ])
      return { topDeals, dailyDrops }
    },
    ['homepage'],
    { revalidate: 3600, tags: ['deals'] }
  )
)

export const searchProducts = async (
  query: string,
  limit = 24
): Promise<ProductCardData[]> => {
  if (!query.trim()) return []

  // PostgreSQL full-text search — SSR only, not cached (each query is unique)
  type ProductRow = {
    id: string
    slug: string
    name: string
    faction: string
    game_system: string
    product_type: string
    gw_rrp_usd: string
    image_url: string | null
  }

  const rows = await prisma.$queryRaw<ProductRow[]>`
    SELECT p.id, p.slug, p.name, p.faction, p.game_system, p.product_type,
           p.gw_rrp_usd, p.image_url
    FROM products p
    WHERE p.is_active = TRUE
      AND to_tsvector('english', p.name || ' ' || p.faction || ' ' || p.game_system)
          @@ plainto_tsquery('english', ${query})
    ORDER BY ts_rank(
      to_tsvector('english', p.name || ' ' || p.faction || ' ' || p.game_system),
      plainto_tsquery('english', ${query})
    ) DESC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    faction: row.faction,
    imageUrl: row.image_url,
    gwRrpUsd: parseFloat(row.gw_rrp_usd),
    cheapestListing: null, // search results don't load listings for performance
  }))
}

export const getPriceHistory = cache(
  unstable_cache(
    async (slug: string): Promise<SerializedPricePoint[]> => {
      type Row = {
        scraped_at: Date | string
        price: string
        store_name: string
        store_slug: string
      }
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT ph.scraped_at, ph.price::text, s.name AS store_name, s.slug AS store_slug
        FROM   price_history ph
        JOIN   listings l ON l.id = ph.listing_id
        JOIN   stores   s ON s.id = l.store_id
        JOIN   products p ON p.id = l.product_id
        WHERE  p.slug = ${slug}
          AND  p.is_active = TRUE
          AND  s.is_active = TRUE
          AND  ph.scraped_at >= NOW() - INTERVAL '90 days'
        ORDER  BY ph.scraped_at ASC
      `
      return rows.map((r) => ({
        date: toIso(r.scraped_at as Date),
        price: parseFloat(r.price),
        storeSlug: r.store_slug,
        storeName: r.store_name,
      }))
    },
    ['price-history'],
    { revalidate: 14400, tags: ['listings'] }
  )
)

export const generateProductStaticParams = cache(
  unstable_cache(
    async (limit = 500) => {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        select: { slug: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      })
      return products.map(({ slug }) => ({ slug }))
    },
    ['product-static-params'],
    { revalidate: 86400, tags: ['products'] }
  )
)

// All distinct factions with product counts — for /factions hub + generateStaticParams
export const getFactions = cache(
  unstable_cache(
    async (): Promise<FactionSummary[]> => {
      const groups = await prisma.product.groupBy({
        by: ['faction', 'gameSystem'],
        where: { isActive: true },
        _count: { _all: true },
      })
      return groups
        .map((g) => ({
          faction: g.faction,
          gameSystem: g.gameSystem,
          slug: g.faction.toLowerCase().replace(/\s+/g, '-'),
          productCount: g._count._all,
          cheapestDiscount: 0,
        }))
        .sort((a, b) => a.faction.localeCompare(b.faction))
    },
    ['factions'],
    { revalidate: 86400, tags: ['products'] }
  )
)

// Products filtered by type — for /battleforce-tracker (battleforce + combat_patrol sections)
export const getProductsByType = cache(
  unstable_cache(
    async (productType: ProductType): Promise<ProductCardData[]> => {
      const products = await prisma.product.findMany({
        where: { isActive: true, productType },
        include: {
          listings: {
            where: { store: { isActive: true } },
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      })
      return products
        .map((p) => productToCardData(p))
        .sort((a, b) => {
          const aDisc = a.cheapestListing?.discountPct ?? 0
          const bDisc = b.cheapestListing?.discountPct ?? 0
          if (bDisc !== aDisc) return bDisc - aDisc
          return (b.cheapestListing?.inStock ? 1 : 0) - (a.cheapestListing?.inStock ? 1 : 0)
        })
    },
    ['products-by-type'],
    { revalidate: 3600, tags: ['products', 'deals'] }
  )
)

// All products for a game system — for /game/[slug] pages
export const getGameSystemProducts = cache(
  unstable_cache(
    async (gameSystemSlug: string): Promise<ProductCardData[]> => {
      const gameSystem = GAME_SYSTEM_MAP[gameSystemSlug]
      if (!gameSystem) return []
      const products = await prisma.product.findMany({
        where: { isActive: true, gameSystem },
        include: {
          listings: {
            where: { store: { isActive: true } },
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      })
      return products.map((p) => productToCardData(p))
    },
    ['game-system-products'],
    { revalidate: 21600, tags: ['products'] }
  )
)
