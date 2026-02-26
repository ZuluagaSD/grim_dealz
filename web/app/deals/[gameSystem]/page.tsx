// Game-system-specific deals page — ISR 1h
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { getDeals, GAME_SYSTEM_MAP } from '@/lib/data'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(GAME_SYSTEM_MAP).map((gameSystem) => ({ gameSystem }))
}

export async function generateMetadata({
  params,
}: {
  params: { gameSystem: string }
}): Promise<Metadata> {
  const gameName = GAME_SYSTEM_MAP[params.gameSystem]
  if (!gameName) return {}

  return {
    title: `${gameName} Deals — Best Prices`,
    description: `Find the best ${gameName} deals across 10+ authorized US retailers. Compare prices and save up to 25% off GW RRP.`,
    alternates: { canonical: `/deals/${params.gameSystem}` },
  }
}

export default async function GameSystemDealsPage({
  params,
}: {
  params: { gameSystem: string }
}) {
  const gameName = GAME_SYSTEM_MAP[params.gameSystem]
  if (!gameName) notFound()

  const deals = await getDeals({
    gameSystem: gameName,
    inStockOnly: true,
    limit: 48,
  })

  // ItemList JSON-LD
  const itemListSchema = deals.length > 0 ? {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Deals', item: `${SITE_URL}/deals` },
          { '@type': 'ListItem', position: 3, name: gameName, item: `${SITE_URL}/deals/${params.gameSystem}` },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${gameName} Deals`,
        numberOfItems: deals.length,
        itemListElement: deals.slice(0, 48).map((deal, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}/product/${deal.slug}`,
          name: deal.name,
        })),
      },
    ],
  } : null
  const schemaJson = itemListSchema
    ? JSON.stringify(itemListSchema).replace(/</g, '\\u003c')
    : null

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {schemaJson && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      )}

      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-bone-faint">
        <Link href="/" className="transition-colors hover:text-gold">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/deals" className="transition-colors hover:text-gold">Deals</Link>
        <span className="mx-2">/</span>
        <span className="text-bone-muted">{gameName}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bone sm:text-4xl">{gameName} Deals</h1>
        <p className="mt-2 text-bone-muted">
          {deals.length} discounted product{deals.length !== 1 ? 's' : ''} across 10+ US retailers
        </p>
      </div>

      {/* Other game system links */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(GAME_SYSTEM_MAP)
          .filter(([slug]) => slug !== params.gameSystem)
          .map(([slug, name]) => (
            <Link
              key={slug}
              href={`/deals/${slug}`}
              className="rounded-full border border-ink-rim bg-ink-card px-3 py-1 text-sm text-bone-muted transition-all hover:border-gold/30 hover:bg-ink-raised hover:text-gold"
            >
              {name}
            </Link>
          ))}
      </div>

      {deals.length === 0 ? (
        <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
          <p className="text-lg font-medium text-bone">No {gameName} deals right now</p>
          <p className="mt-1 text-sm text-bone-muted">
            Check back later — scrapers run every 4 hours.
          </p>
          <Link href="/deals" className="mt-4 inline-block text-sm text-gold hover:text-gold-light">
            View all deals →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {deals.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
