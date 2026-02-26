import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { getFactionsWithListings } from '@/lib/data'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

const GAME_SLUGS = ['warhammer-40k', 'age-of-sigmar', 'horus-heresy', 'the-old-world']

const PRODUCTS_PER_SITEMAP = 1000

/** Encode characters that are invalid in XML sitemap URLs */
function xmlSafeUrl(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;')
}

/**
 * Split into multiple sitemaps (sitemap index):
 *   id=0  → static pages + game pages + faction pages
 *   id=1+ → product pages (only those with active listings), chunked
 */
export async function generateSitemaps() {
  const count = await prisma.product.count({
    where: {
      isActive: true,
      listings: { some: { store: { isActive: true } } },
    },
  })

  const productChunks = Math.max(1, Math.ceil(count / PRODUCTS_PER_SITEMAP))
  const ids = [{ id: 0 }]
  for (let i = 1; i <= productChunks; i++) {
    ids.push({ id: i })
  }
  return ids
}

export default async function sitemap({
  id,
}: {
  id: number
}): Promise<MetadataRoute.Sitemap> {
  if (id === 0) {
    const staticPages: MetadataRoute.Sitemap = [
      { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
      { url: `${SITE_URL}/deals`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
      { url: `${SITE_URL}/battleforce-tracker`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
      { url: `${SITE_URL}/factions`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
      { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    ]

    const gamePages: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
      url: `${SITE_URL}/game/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }))

    const gameDealsPages: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
      url: `${SITE_URL}/deals/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    }))

    const factions = await getFactionsWithListings()
    const factionPages: MetadataRoute.Sitemap = factions.map((f) => ({
      url: xmlSafeUrl(`${SITE_URL}/faction/${f.slug}`),
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }))

    return [...staticPages, ...gamePages, ...gameDealsPages, ...factionPages]
  }

  // Product pages — only products that have at least one active listing.
  // Uses listing lastCheckedAt for accurate lastModified signal.
  const skip = (id - 1) * PRODUCTS_PER_SITEMAP
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      listings: { some: { store: { isActive: true } } },
    },
    select: {
      slug: true,
      listings: {
        where: { store: { isActive: true } },
        select: { lastCheckedAt: true },
        orderBy: { lastCheckedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
    skip,
    take: PRODUCTS_PER_SITEMAP,
  })

  return products.map((p) => ({
    url: xmlSafeUrl(`${SITE_URL}/product/${p.slug}`),
    lastModified: p.listings[0]?.lastCheckedAt ?? new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))
}
