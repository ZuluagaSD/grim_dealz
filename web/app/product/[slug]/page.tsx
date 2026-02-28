// Product detail page — ISR 4h
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { Metadata } from 'next'
import PriceComparisonTable from '@/components/server/PriceComparisonTable'
import PriceHistoryChart from '@/components/client/PriceHistoryChart'
import ProductCard from '@/components/server/ProductCard'
import Link from 'next/link'
import { getProduct, getProductListings, getPriceHistory, generateProductStaticParams, getRelatedProducts, GAME_SYSTEM_SLUG_MAP } from '@/lib/data'
import type { ProductWithListings, SerializedListing } from '@/lib/types'
import { formatPrice } from '@/lib/format'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

function buildProductSchema(
  product: ProductWithListings,
  listings: SerializedListing[]
) {
  const prices = listings.map((l) => l.currentPrice)
  const lowPrice = prices.length > 0 ? Math.min(...prices) : Number(product.gwRrpUsd)
  const highPrice = prices.length > 0 ? Math.max(...prices) : Number(product.gwRrpUsd)
  const factionSlug = product.faction.toLowerCase().replace(/\s+/g, '-')
  const gameSystemSlug = GAME_SYSTEM_SLUG_MAP[product.gameSystem] ?? ''

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          ...(gameSystemSlug
            ? [{ '@type': 'ListItem', position: 2, name: product.gameSystem, item: `${SITE_URL}/game/${gameSystemSlug}` }]
            : []),
          { '@type': 'ListItem', position: gameSystemSlug ? 3 : 2, name: product.faction, item: `${SITE_URL}/faction/${factionSlug}` },
          { '@type': 'ListItem', position: gameSystemSlug ? 4 : 3, name: product.name, item: `${SITE_URL}/product/${product.slug}` },
        ],
      },
      {
        '@type': 'Product',
        name: product.name,
        ...(product.imageUrl ? { image: product.imageUrl } : {}),
        brand: { '@type': 'Brand', name: 'Games Workshop' },
        sku: product.gwItemNumber,
        mpn: product.gwItemNumber,
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: lowPrice.toFixed(2),
          highPrice: highPrice.toFixed(2),
          offerCount: listings.length,
          priceCurrency: 'USD',
          offers: listings.map((l) => ({
            '@type': 'Offer',
            price: l.currentPrice.toFixed(2),
            priceCurrency: 'USD',
            availability: l.inStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            priceValidUntil: new Date(
              new Date(l.lastCheckedAt).getTime() + 24 * 60 * 60 * 1000
            )
              .toISOString()
              .split('T')[0],
            // Use the retailer's direct URL — avoids Google crawling /go/ redirects
            url: l.storeProductUrl ?? `${SITE_URL}/product/${product.slug}`,
            seller: { '@type': 'Organization', name: l.storeName },
          })),
        },
      },
    ],
  }
}

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

  const cheapest = product.listings[0]
  const desc = cheapest
    ? `Buy ${product.name} from $${Number(cheapest.currentPrice).toFixed(2)} — ${Math.round(Number(cheapest.discountPct))}% off GW RRP. Compare 10+ authorized US retailers.`
    : `Compare prices for ${product.name} across 10+ authorized US Warhammer retailers. GW RRP: $${Number(product.gwRrpUsd).toFixed(2)}.`

  const hasListings = product.listings.length > 0

  return {
    title: `${product.name} — Best Price`,
    description: desc,
    alternates: {
      canonical: `/product/${product.slug}`,
    },
    // noindex product pages with no retailer listings — thin content.
    // Once scrapers add listings, next ISR revalidation removes the tag.
    ...(!hasListings && { robots: { index: false, follow: true } }),
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

  const factionSlug = product.faction.toLowerCase().replace(/\s+/g, '-')
  const gameSystemSlug = GAME_SYSTEM_SLUG_MAP[product.gameSystem] ?? ''

  const relatedProducts = await getRelatedProducts(factionSlug, params.slug, 8)

  const cheapest = listings[0]
  const savings = cheapest
    ? Number(product.gwRrpUsd) - cheapest.currentPrice
    : 0

  const schema = buildProductSchema(product, listings)
  const schemaJson = JSON.stringify(schema).replace(/</g, '\\u003c')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-bone-faint">
        <Link href="/" className="transition-colors hover:text-gold">Home</Link>
        {gameSystemSlug && (
          <>
            <span>/</span>
            <Link href={`/game/${gameSystemSlug}`} className="transition-colors hover:text-gold">
              {product.gameSystem}
            </Link>
          </>
        )}
        <span>/</span>
        <Link
          href={`/faction/${factionSlug}`}
          className="transition-colors hover:text-gold"
        >
          {product.faction}
        </Link>
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
                  {formatPrice(cheapest.currentPrice, cheapest.currency)}
                </span>
                {cheapest.currency === 'USD' && (
                  <>
                    <span className="text-lg text-bone-faint line-through">
                      ${Number(product.gwRrpUsd).toFixed(2)} RRP
                    </span>
                    {savings > 0 && (
                      <span className="rounded bg-green-900/40 px-2 py-0.5 text-sm font-bold text-green-400">
                        Save ${savings.toFixed(2)}
                      </span>
                    )}
                  </>
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

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-bone">More {product.faction} Products</h2>
            <Link
              href={`/faction/${factionSlug}`}
              className="text-sm text-gold transition-colors hover:text-gold-light"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {relatedProducts.map((related) => (
              <ProductCard key={related.slug} product={related} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
