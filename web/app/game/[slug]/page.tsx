// Game system page — ISR 6h
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { getGameSystemProducts, GAME_SYSTEM_MAP, getFactions } from '@/lib/data'

export const revalidate = 21600
export const dynamicParams = false

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.grimdealz.com'

export function generateStaticParams() {
  return Object.keys(GAME_SYSTEM_MAP).map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const gameName = GAME_SYSTEM_MAP[params.slug]
  if (!gameName) return {}

  return {
    title: `${gameName} Prices — Compare All Products`,
    description: `Compare all ${gameName} Warhammer prices across 10+ authorized US retailers. Browse by faction and find the best deals.`,
    alternates: { canonical: `/game/${params.slug}` },
  }
}

export default async function GameSystemPage({
  params,
}: {
  params: { slug: string }
}) {
  const gameName = GAME_SYSTEM_MAP[params.slug]
  if (!gameName) notFound()

  const [products, allFactions] = await Promise.all([
    getGameSystemProducts(params.slug),
    getFactions(),
  ])

  const gameFactions = allFactions.filter((f) => f.gameSystem === gameName)

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: gameName, item: `${SITE_URL}/game/${params.slug}` },
    ],
  }
  const schemaJson = JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />

      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-bone-faint">
        <a href="/" className="transition-colors hover:text-gold">Home</a>
        <span className="mx-2">/</span>
        <span className="text-bone-muted">{gameName}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bone sm:text-4xl">{gameName}</h1>
        <p className="mt-2 text-bone-muted">
          {products.length} products across {gameFactions.length} faction{gameFactions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Faction filter links */}
      {gameFactions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {gameFactions.map((f) => (
            <Link
              key={f.slug}
              href={`/faction/${f.slug}`}
              className="rounded-full border border-ink-rim bg-ink-card px-3 py-1 text-sm text-bone-muted transition-all hover:border-gold/30 hover:bg-ink-raised hover:text-gold"
            >
              {f.faction}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
          <p className="text-lg font-medium text-bone">No products found</p>
          <p className="mt-1 text-sm text-bone-muted">
            Products for this game system haven&apos;t been seeded yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
