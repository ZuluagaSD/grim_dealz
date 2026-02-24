// Homepage — ISR 1h
import type { Metadata } from 'next'
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { getHomepageData } from '@/lib/data'

export const revalidate = 3600

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.grimdealz.com'

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'GrimDealz',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

const FEATURED_FACTIONS = [
  { name: 'Space Marines', slug: 'space-marines', color: '#4a7fd4' },
  { name: 'Necrons', slug: 'necrons', color: '#4ade80' },
  { name: 'Orks', slug: 'orks', color: '#86efac' },
  { name: 'Stormcast Eternals', slug: 'stormcast-eternals', color: '#fbbf24' },
]

export default async function HomePage() {
  const { topDeals, dailyDrops } = await getHomepageData()
  const schemaJson = JSON.stringify(websiteSchema).replace(/</g, '\\u003c')

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      {/* Hero */}
      <section className="relative overflow-hidden py-16 text-center sm:py-20">
        {/* Atmospheric glow — no external images */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 70% 50% at 50% 60%, rgba(201,168,76,0.08) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 80% 40% at 50% 110%, rgba(183,28,28,0.12) 0%, transparent 60%)',
            }}
          />
        </div>

        <p className="relative mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gold/70">
          Warhammer Price Intelligence
        </p>
        <h1 className="font-cinzel relative text-4xl font-bold tracking-tight text-bone sm:text-5xl lg:text-6xl">
          Best Prices.{' '}
          <span className="text-gold">Every Realm.</span>
        </h1>
        <p className="relative mt-5 text-lg text-bone-muted">
          Compare 10+ authorized US retailers instantly. Save up to 25% off GW RRP.
        </p>

        <div className="relative mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/deals"
            className="inline-flex items-center justify-center rounded-lg bg-gold px-8 py-3 text-base font-semibold text-ink transition-all hover:bg-gold-light hover:shadow-gold-glow"
          >
            See All Deals →
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-lg border border-ink-rim bg-ink-card px-8 py-3 text-base font-semibold text-bone transition-all hover:border-gold/30 hover:bg-ink-raised"
          >
            Search Products
          </Link>
        </div>
      </section>

      {/* Daily Drops */}
      {dailyDrops.length > 0 && (
        <section className="mt-4 pb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-bone">
              <span className="mr-2 text-red-400">🔥</span>Daily Drops
            </h2>
            <Link href="/deals?window=24h" className="text-sm text-gold/70 transition-colors hover:text-gold">
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
        <section className="mt-8 pb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-bone">Top Deals</h2>
            <Link href="/deals" className="text-sm text-gold/70 transition-colors hover:text-gold">
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
        <section className="mt-8 rounded-lg border border-gold/20 bg-gold-dim p-6 text-center">
          <p className="font-medium text-gold">
            ⚙ Scrapers are running — prices loading soon.
          </p>
          <p className="mt-1 text-sm text-bone-muted">
            Check back in a few hours once scrapers complete their first run.
          </p>
        </section>
      )}

      {/* Featured Factions */}
      <section className="mt-8 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-bone">Browse by Faction</h2>
          <Link href="/factions" className="text-sm text-gold/70 transition-colors hover:text-gold">
            Browse All Factions →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FEATURED_FACTIONS.map((f) => (
            <Link
              key={f.slug}
              href={`/faction/${f.slug}`}
              className="group flex items-center gap-3 rounded-lg border border-ink-rim bg-ink-card p-4 transition-all hover:border-ink-high hover:bg-ink-raised"
            >
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full transition-shadow group-hover:shadow-[0_0_8px_currentColor]"
                style={{ backgroundColor: f.color, color: f.color }}
              />
              <span className="text-sm font-medium text-bone-muted transition-colors group-hover:text-bone">
                {f.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-4 mb-8 rounded-xl border border-ink-rim bg-ink-card p-8">
        <h2 className="mb-8 text-center text-lg font-bold uppercase tracking-widest text-bone-faint">
          How It Works
        </h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[
            {
              step: '01',
              title: 'We scrape 10+ stores',
              desc: 'Every 4 hours, scrapers check authorized GW retailers for price changes.',
            },
            {
              step: '02',
              title: 'You see the cheapest price',
              desc: 'All prices normalized and compared against GW RRP in one table.',
            },
            {
              step: '03',
              title: 'Click to buy',
              desc: 'Links go directly to the retailer. We earn a small affiliate commission.',
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <p className="font-cinzel mb-3 text-3xl font-bold text-gold/30">{item.step}</p>
              <h3 className="font-semibold text-bone">{item.title}</h3>
              <p className="mt-1.5 text-sm text-bone-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
