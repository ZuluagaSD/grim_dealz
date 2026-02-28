import { PrismaClient } from "@prisma/client"
import type { ProductMatch } from "./types.js"

export class ProductMatcher {
  private readonly prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * Fuzzy-match an extracted product query against the products table.
   * Tries exact-ish (case-insensitive contains) first, then falls back
   * to matching all significant words in the query.
   */
  async findMatch(query: string): Promise<ProductMatch | null> {
    if (!query || query.length < 2) {
      return null
    }

    // Try case-insensitive substring match
    let products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        name: { contains: query, mode: "insensitive" },
      },
      include: {
        listings: {
          where: { inStock: true },
          include: { store: true },
          orderBy: { discountPct: "desc" },
          take: 1,
        },
      },
      take: 5,
    })

    // Fallback: match all significant words (3+ chars)
    if (products.length === 0) {
      const words = query.split(/\s+/).filter((w) => w.length >= 3)
      if (words.length === 0) return null

      products = await this.prisma.product.findMany({
        where: {
          isActive: true,
          AND: words.map((word) => ({
            name: { contains: word, mode: "insensitive" as const },
          })),
        },
        include: {
          listings: {
            where: { inStock: true },
            include: { store: true },
            orderBy: { discountPct: "desc" },
            take: 1,
          },
        },
        take: 5,
      })

      if (products.length === 0) return null
    }

    // Pick best match: shortest name that matched = most specific product
    const sorted = [...products].sort((a, b) => a.name.length - b.name.length)
    const best = sorted[0]
    if (!best) return null

    const bestListing = best.listings[0]

    return {
      productId: best.id,
      productName: best.name,
      productSlug: best.slug,
      gwRrp: Number(best.gwRrpUsd),
      bestPrice: bestListing ? Number(bestListing.currentPrice) : null,
      bestStore: bestListing ? bestListing.store.name : null,
      discountPct: bestListing ? Number(bestListing.discountPct) : null,
    }
  }
}
