// Homepage — ISR 1h
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { getHomepageData } from '@/lib/data'

export const revalidate = 3600

const FEATURED_FACTIONS = [
  { name: 'Space Marines', slug: 'space-marines', emoji: '🛡️' },
  { name: 'Necrons', slug: 'necrons', emoji: '💀' },
  { name: 'Orks', slug: 'orks', emoji: '⚔️' },
  { name: 'Stormcast Eternals', slug: 'stormcast-eternals', emoji: '⚡' },
]

export default async function HomePage() {
  const { topDeals, dailyDrops } = await getHomepageData()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Best Warhammer Prices — Instantly
        </h1>
        <p className="mt-4 text-xl text-gray-600">
          Compare prices across 10+ authorized US retailers. Save up to 25% off GW RRP.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/deals"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700"
          >
            See All Deals
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
          >
            Search Products
          </Link>
        </div>
      </section>

      {/* Daily Drops */}
      {dailyDrops.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">🔥 Daily Drops</h2>
            <Link href="/deals?window=24h" className="text-sm text-blue-600 hover:underline">
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {dailyDrops.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Top Deals */}
      {topDeals.length > 0 ? (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Top Deals</h2>
            <Link href="/deals" className="text-sm text-blue-600 hover:underline">
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {topDeals.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-12 rounded-lg bg-yellow-50 border border-yellow-200 p-6 text-center">
          <p className="text-yellow-800 font-medium">
            🚧 Scrapers are running — prices loading soon.
          </p>
          <p className="mt-1 text-sm text-yellow-600">
            Check back in a few hours once affiliate scrapers complete their first run.
          </p>
        </section>
      )}

      {/* Featured Factions */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Browse by Faction</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {FEATURED_FACTIONS.map((f) => (
            <Link
              key={f.slug}
              href={`/faction/${f.slug}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <span className="text-2xl">{f.emoji}</span>
              <span className="font-medium text-gray-900">{f.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-16 rounded-xl bg-gray-50 p-8">
        <h2 className="text-xl font-bold text-gray-900 text-center mb-6">How GrimDealz Works</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { step: '1', title: 'We scrape 10+ stores', desc: 'Every 4 hours, scrapers check authorized GW retailers for price changes.' },
            { step: '2', title: 'You see the cheapest price', desc: 'All prices normalized and compared against GW RRP in one table.' },
            { step: '3', title: 'Click to buy', desc: 'Links go directly to the retailer. We earn a small affiliate commission.' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                {item.step}
              </div>
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
