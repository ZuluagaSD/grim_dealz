import type { Prisma } from '@prisma/client'

// Exact shape returned by getProduct
export type ProductWithListings = Prisma.ProductGetPayload<{
  include: {
    listings: {
      include: { store: true }
      orderBy: { currentPrice: 'asc' }
    }
  }
}>

// Options bag for getDeals — typed, not untyped object
export type GetDealsOptions = {
  minDiscountPct?: number
  inStockOnly?: boolean
  limit?: number
  offset?: number
  faction?: string | undefined
  gameSystem?: string | undefined
  window?: '24h' | '7d' | undefined
}

// Serialized form safe for components — Decimal converted to number, no Prisma types
export type SerializedListing = {
  id: string
  storeSlug: string
  storeName: string
  currentPrice: number // Prisma.Decimal.toNumber()
  discountPct: number
  inStock: boolean
  stockStatus: string
  affiliateUrl: string | null
  storeProductUrl: string | null
  lastCheckedAt: string // ISO string — Date serialized for Client Components
}

// What ProductCard actually receives — pre-computed, not raw Prisma
export type ProductCardData = {
  slug: string
  name: string
  faction: string
  imageUrl: string | null
  gwRrpUsd: number
  cheapestListing: {
    currentPrice: number
    discountPct: number
    storeName: string
    storeSlug: string
    listingId: string
    inStock: boolean
    lastCheckedAt: string
    isAllTimeLow: boolean // computed in query layer, not component
  } | null
}

// For the deals page — product with its cheapest listing
export type DealItem = ProductCardData & {
  gameSystem: string
  productType: string
}

// For faction page — faction summary
export type FactionSummary = {
  faction: string
  gameSystem: string
  slug: string // faction slug for /faction/[slug] route
  productCount: number
  cheapestDiscount: number // highest discount_pct available
}
