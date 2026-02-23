// Product detail page — ISR 4h
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { Metadata } from 'next'
import PriceComparisonTable from '@/components/server/PriceComparisonTable'
import PriceHistoryChart from '@/components/client/PriceHistoryChart'
import { getProduct, getProductListings, getPriceHistory, generateProductStaticParams } from '@/lib/data'

export const revalidate = 14400
export const dynamicParams = true

export async function generateStaticParams() {
  return generateProductStaticParams(500)
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const product = await getProduct(params.slug)
  if (!product) return {}

  return {
    title: product.name,
    description: `Compare prices for ${product.name} across 10+ authorized US Warhammer retailers. GW RRP: $${Number(product.gwRrpUsd).toFixed(2)}.`,
    alternates: {
      canonical: `/product/${product.slug}`,
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string }
}) {
  const [product, listings, priceHistory] = await Promise.all([
    getProduct(params.slug),
    getProductListings(params.slug),
    getPriceHistory(params.slug),
  ])

  if (!product) {
    notFound()
  }

  const cheapest = listings[0]
  const savings = cheapest
    ? Number(product.gwRrpUsd) - cheapest.currentPrice
    : 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-bone-faint">
        <a href="/" className="transition-colors hover:text-gold">Home</a>
        <span>/</span>
        <a
          href={`/faction/${product.faction.toLowerCase().replace(/\s+/g, '-')}`}
          className="transition-colors hover:text-gold"
        >
          {product.faction}
        </a>
        <span>/</span>
        <span className="text-bone-muted">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Product image */}
        <div className="relative aspect-square overflow-hidden rounded-xl border border-ink-rim bg-ink-card">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-contain p-6"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-bone-faint">
              <svg className="h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Product info */}
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-gold/80">
            {product.faction} · {product.gameSystem}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-bone">{product.name}</h1>

          <div className="mt-4 flex items-baseline gap-3">
            {cheapest ? (
              <>
                <span className="text-4xl font-bold text-bone">
                  ${cheapest.currentPrice.toFixed(2)}
                </span>
                <span className="text-lg text-bone-faint line-through">
                  ${Number(product.gwRrpUsd).toFixed(2)} RRP
                </span>
                {savings > 0 && (
                  <span className="rounded bg-green-900/40 px-2 py-0.5 text-sm font-bold text-green-400">
                    Save ${savings.toFixed(2)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-2xl font-bold text-bone-muted">
                GW RRP: ${Number(product.gwRrpUsd).toFixed(2)}
              </span>
            )}
          </div>

          {cheapest && (
            <div className="mt-6">
              <a
                href={`/go/${cheapest.storeSlug}/${cheapest.id}`}
                className="block w-full rounded-lg bg-gold px-6 py-3 text-center text-base font-semibold text-ink transition-all hover:bg-gold-light hover:shadow-gold-glow"
                rel="nofollow sponsored"
              >
                Buy at {cheapest.storeName} →
              </a>
            </div>
          )}

          <div className="mt-4 text-sm text-bone-faint">
            <p>GW Item #: {product.gwItemNumber}</p>
            {cheapest && (
              <p className="mt-1">
                Last checked: {new Date(cheapest.lastCheckedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Price Comparison Table */}
      <div className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-bone">Compare Prices</h2>
        <PriceComparisonTable
          listings={listings}
          gwRrpUsd={Number(product.gwRrpUsd)}
          gwUrl={product.gwUrl}
        />
      </div>

      {/* Price History Chart */}
      <div className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-bone">Price History</h2>
        <PriceHistoryChart points={priceHistory} gwRrpUsd={Number(product.gwRrpUsd)} />
      </div>
    </div>
  )
}
