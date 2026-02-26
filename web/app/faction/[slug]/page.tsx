// Faction page — ISR 6h
import type { Metadata } from 'next'
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { getFactionProducts, getFactions, GAME_SYSTEM_SLUG_MAP } from '@/lib/data'

export const revalidate = 21600
export const dynamicParams = true

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

export async function generateStaticParams() {
  const factions = await getFactions()
  return factions.map((f) => ({ slug: f.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const allFactions = await getFactions()
  const faction = allFactions.find((f) => f.slug === decodeURIComponent(params.slug))
  const factionName = faction?.faction ?? decodeURIComponent(params.slug)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const products = await getFactionProducts(params.slug)
  const hasProducts = products.length > 0

  return {
    title: `${factionName} Warhammer Prices — Compare Retailers`,
    description: `Compare ${factionName} Warhammer prices across 10+ authorized US retailers. Find the best deals and save up to 25% off GW RRP.`,
    alternates: {
      canonical: `/faction/${params.slug}`,
    },
    // noindex faction pages with no products — thin content
    ...(!hasProducts && { robots: { index: false, follow: true } }),
  }
}

export default async function FactionPage({
  params,
}: {
  params: { slug: string }
}) {
  const [products, allFactions] = await Promise.all([
    getFactionProducts(params.slug),
    getFactions(),
  ])

  const decodedSlug = decodeURIComponent(params.slug)
  const factionMeta = allFactions.find((f) => f.slug === decodedSlug)
  const factionName = factionMeta?.faction ?? decodedSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  const gameSystem = factionMeta?.gameSystem ?? ''
  const gameSystemSlug = GAME_SYSTEM_SLUG_MAP[gameSystem] ?? ''

  // Sibling factions in the same game system
  const siblingFactions = allFactions.filter(
    (f) => f.gameSystem === gameSystem && f.slug !== decodedSlug
  )

  // Stats
  const withListings = products.filter((p) => p.cheapestListing)
  const onSale = withListings.filter((p) => (p.cheapestListing?.discountPct ?? 0) >= 5)
  const bestDeal = onSale.length > 0
    ? onSale.reduce((best, p) =>
        (p.cheapestListing?.discountPct ?? 0) > (best.cheapestListing?.discountPct ?? 0) ? p : best
      )
    : null

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      ...(gameSystemSlug
        ? [{ '@type': 'ListItem', position: 2, name: gameSystem, item: `${SITE_URL}/game/${gameSystemSlug}` }]
        : []),
      { '@type': 'ListItem', position: gameSystemSlug ? 3 : 2, name: factionName, item: `${SITE_URL}/faction/${params.slug}` },
    ],
  }
  const schemaJson = JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-bone-faint">
        <Link href="/" className="transition-colors hover:text-gold">Home</Link>
        <span className="mx-2 text-bone-faint">/</span>
        {gameSystemSlug && (
          <>
            <Link href={`/game/${gameSystemSlug}`} className="transition-colors hover:text-gold">
              {gameSystem}
            </Link>
            <span className="mx-2 text-bone-faint">/</span>
          </>
        )}
        <span className="text-bone-muted">{factionName}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bone">{factionName}</h1>
        <p className="mt-1 text-sm text-bone-muted">
          {products.length} products{onSale.length > 0 && ` · ${onSale.length} on sale`}
          {bestDeal?.cheapestListing && ` · Best deal: ${Math.round(bestDeal.cheapestListing.discountPct)}% off`}
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
          <p className="text-lg font-medium text-bone">No products found</p>
          <p className="mt-1 text-sm text-bone-muted">
            This faction may not have any products listed yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}

      {/* Sibling factions in same game system */}
      {siblingFactions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold text-bone">
            More {gameSystem} Factions
          </h2>
          <div className="flex flex-wrap gap-2">
            {siblingFactions.map((f) => (
              <Link
                key={f.slug}
                href={`/faction/${f.slug}`}
                className="rounded-full border border-ink-rim bg-ink-card px-3 py-1 text-sm text-bone-muted transition-all hover:border-gold/30 hover:bg-ink-raised hover:text-gold"
              >
                {f.faction}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
