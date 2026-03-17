import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { MIN_LISTINGS_FOR_INDEX } from '@/lib/seo-constants'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.grimdealz.com'
const PRODUCTS_PER_SITEMAP = 1000

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Count products with 2+ in-stock listings — must match sitemap.ts logic
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
  const productCount = Number(rows[0]?.count ?? 0)
  const productChunks = Math.max(1, Math.ceil(productCount / PRODUCTS_PER_SITEMAP))

  const sitemapUrls = []
  for (let i = 0; i <= productChunks; i++) {
    sitemapUrls.push(`${SITE_URL}/sitemap/${i}.xml`)
  }

  return {
    rules: [
      {
        userAgent: 'Twitterbot',
        allow: ['/api/og'],
        disallow: ['/go/', '/admin/'],
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/go/', '/api/', '/admin/'],
      },
    ],
    sitemap: sitemapUrls,
  }
}
