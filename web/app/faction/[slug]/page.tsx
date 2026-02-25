// Faction page — ISR 6h
import type { Metadata } from 'next'
import ProductCard from '@/components/server/ProductCard'
import { getFactionProducts, getFactions } from '@/lib/data'

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
  const decodedSlug = decodeURIComponent(params.slug)
  const factionName = decodedSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    title: `${factionName} Warhammer Prices — Compare Retailers`,
    description: `Compare ${factionName} Warhammer prices across 10+ authorized US retailers. Find the best deals and save up to 25% off GW RRP.`,
    alternates: {
      canonical: `/faction/${params.slug}`,
    },
  }
}

export default async function FactionPage({
  params,
}: {
  params: { slug: string }
}) {
  const products = await getFactionProducts(params.slug)

  const decodedSlug = decodeURIComponent(params.slug)
  const factionName = decodedSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: factionName, item: `${SITE_URL}/faction/${params.slug}` },
    ],
  }
  const schemaJson = JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-bone-faint">
        <a href="/" className="transition-colors hover:text-gold">Home</a>
        <span className="mx-2 text-bone-faint">/</span>
        <span className="text-bone-muted">{factionName}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bone">{factionName}</h1>
        <p className="mt-1 text-sm text-bone-muted">{products.length} products available</p>
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
    </div>
  )
}
