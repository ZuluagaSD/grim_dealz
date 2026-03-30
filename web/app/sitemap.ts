import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { getFactionsWithListings } from '@/lib/data'
import { getAllPosts } from '@/lib/blog'
import { MIN_LISTINGS_FOR_INDEX } from '@/lib/seo-constants'

export const revalidate = 3600

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

const GAME_SLUGS = ['warhammer-40k', 'age-of-sigmar', 'horus-heresy', 'the-old-world']

const PRODUCTS_PER_SITEMAP = 1000

/** Encode characters that are invalid in XML sitemap URLs */
function xmlSafeUrl(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;')
}

/** Count products with N+ in-stock listings from active stores */
async function countSitemapProducts(): Promise<number> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count FROM (
      SELECT p.id
      FROM products p
      JOIN listings l ON l.product_id = p.id
      JOIN stores  s ON s.id = l.store_id
      WHERE p.is_active = TRUE
        AND s.is_active = TRUE
        AND l.in_stock  = TRUE
      GROUP BY p.id
      HAVING COUNT(*) >= ${MIN_LISTINGS_FOR_INDEX}
    ) sub
  `
  return Number(rows[0]?.count ?? 0)
}

/**
 * Split into multiple sitemaps (sitemap index):
 *   id=0  → static pages + game pages + faction pages
 *   id=1+ → product pages (only those with 2+ active in-stock listings), chunked
 */
export async function generateSitemaps() {
  const count = await countSitemapProducts()

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
      { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
      { url: `${SITE_URL}/deals`, changeFrequency: 'hourly', priority: 0.9 },
      { url: `${SITE_URL}/battleforce-tracker`, changeFrequency: 'daily', priority: 0.9 },
      { url: `${SITE_URL}/factions`, changeFrequency: 'weekly', priority: 0.7 },
      { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    ]

    const gamePages: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
      url: `${SITE_URL}/game/${slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }))

    const gameDealsPages: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
      url: `${SITE_URL}/deals/${slug}`,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    }))

    const factions = await getFactionsWithListings()
    const factionPages: MetadataRoute.Sitemap = factions.map((f) => ({
      url: xmlSafeUrl(`${SITE_URL}/faction/${f.slug}`),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }))

    const blogPages: MetadataRoute.Sitemap = [
      { url: `${SITE_URL}/blog`, changeFrequency: 'weekly' as const, priority: 0.7 },
      ...getAllPosts().map((post) => ({
        url: `${SITE_URL}/blog/${post.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
        lastModified: new Date(post.updatedAt ?? post.publishedAt),
      })),
    ]

    return [...staticPages, ...gamePages, ...gameDealsPages, ...factionPages, ...blogPages]
  }

  // Product pages — only products with MIN_LISTINGS_FOR_INDEX+ in-stock listings from active stores.
  // Uses listing lastCheckedAt for accurate lastModified signal.
  const skip = (id - 1) * PRODUCTS_PER_SITEMAP
  type Row = { slug: string; last_checked: Date | null }
  const products = await prisma.$queryRaw<Row[]>`
    SELECT p.slug, MAX(l.last_checked_at) AS last_checked
    FROM products p
    JOIN listings l ON l.product_id = p.id
    JOIN stores  s ON s.id = l.store_id
    WHERE p.is_active = TRUE
      AND s.is_active = TRUE
      AND l.in_stock  = TRUE
    GROUP BY p.slug, p.name
    HAVING COUNT(*) >= ${MIN_LISTINGS_FOR_INDEX}
    ORDER BY p.name ASC
    OFFSET ${skip}
    LIMIT ${PRODUCTS_PER_SITEMAP}
  `

  return products.map((p) => {
    const entry: MetadataRoute.Sitemap[number] = {
      url: xmlSafeUrl(`${SITE_URL}/product/${p.slug}`),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }
    if (p.last_checked) {
      entry.lastModified = p.last_checked
    }
    return entry
  })
}
