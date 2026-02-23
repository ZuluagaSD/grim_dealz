import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { getFactions } from '@/lib/data'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

const GAME_SLUGS = ['warhammer-40k', 'age-of-sigmar', 'horus-heresy', 'the-old-world']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), priority: 1.0 },
    { url: `${SITE_URL}/deals`, lastModified: new Date(), priority: 0.8 },
    { url: `${SITE_URL}/battleforce-tracker`, lastModified: new Date(), priority: 0.9 },
    { url: `${SITE_URL}/factions`, lastModified: new Date(), priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), priority: 0.3 },
  ]

  const gamePages: MetadataRoute.Sitemap = GAME_SLUGS.map((slug) => ({
    url: `${SITE_URL}/game/${slug}`,
    lastModified: new Date(),
    priority: 0.7,
  }))

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  })
  const productPages: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}/product/${p.slug}`,
    lastModified: p.updatedAt,
    priority: 0.7,
  }))

  const factions = await getFactions()
  const factionPages: MetadataRoute.Sitemap = factions.map((f) => ({
    url: `${SITE_URL}/faction/${f.slug}`,
    lastModified: new Date(),
    priority: 0.8,
  }))

  return [...staticPages, ...gamePages, ...productPages, ...factionPages]
}
