import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'
const PRODUCTS_PER_SITEMAP = 1000

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Dynamically compute the same sitemap IDs as sitemap.ts generateSitemaps()
  const count = await prisma.product.count({
    where: {
      isActive: true,
      listings: { some: { store: { isActive: true } } },
    },
  })
  const productChunks = Math.max(1, Math.ceil(count / PRODUCTS_PER_SITEMAP))
  const sitemapUrls = []
  for (let i = 0; i <= productChunks; i++) {
    sitemapUrls.push(`${SITE_URL}/sitemap/${i}.xml`)
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/go/', '/api/', '/admin/', '/search'],
      },
    ],
    sitemap: sitemapUrls,
  }
}
