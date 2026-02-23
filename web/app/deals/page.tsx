// Deals page — ISR 1h
import type { Metadata } from 'next'
import ProductCard from '@/components/server/ProductCard'
import { getDeals } from '@/lib/data'

export const revalidate = 3600

type SearchParams = {
  window?: string
  faction?: string
  gameSystem?: string
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const window = searchParams.window === '24h' ? 'Daily' : searchParams.window === '7d' ? 'Weekly' : ''
  return {
    title: window ? `${window} Price Drops` : 'Best Deals',
    description: 'Find the best discounts on Warhammer miniatures, paints, and books across 10+ authorized US retailers.',
    alternates: { canonical: '/deals' },
  }
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const window = searchParams.window === '24h' || searchParams.window === '7d'
    ? (searchParams.window as '24h' | '7d')
    : undefined

  const deals = await getDeals({
    window,
    faction: searchParams.faction,
    gameSystem: searchParams.gameSystem,
    inStockOnly: true,
    limit: 48,
  })

  const title = window === '24h'
    ? 'Daily Price Drops'
    : window === '7d'
    ? '7-Day Price Drops'
    : 'Best Deals'

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bone">{title}</h1>
        <p className="mt-1 text-sm text-bone-muted">
          {deals.length} products at discount vs GW RRP
        </p>
      </div>

      {/* Window filter tabs */}
      <div className="mb-6 flex gap-2">
        {[
          { label: 'All Deals', href: '/deals' },
          { label: 'Last 24h', href: '/deals?window=24h' },
          { label: 'Last 7 Days', href: '/deals?window=7d' },
        ].map((tab) => {
          const isActive =
            (tab.href === '/deals' && !window) ||
            (tab.href.includes('24h') && window === '24h') ||
            (tab.href.includes('7d') && window === '7d')
          return (
            <a
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gold text-ink shadow-gold-glow'
                  : 'border border-ink-rim bg-ink-card text-bone-muted hover:border-gold/30 hover:bg-ink-raised hover:text-bone'
              }`}
            >
              {tab.label}
            </a>
          )
        })}
      </div>

      {deals.length === 0 ? (
        <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
          <p className="text-lg font-medium text-bone">No deals found</p>
          <p className="mt-1 text-sm text-bone-muted">
            {window
              ? 'No price drops in this time window yet.'
              : 'Scrapers are still gathering prices. Check back soon.'}
          </p>
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
