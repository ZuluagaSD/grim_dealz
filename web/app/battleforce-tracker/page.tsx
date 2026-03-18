// Battleforce Tracker — ISR 1h
import type { Metadata } from 'next'
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { getProductsByType, ProductType } from '@/lib/data'

export const revalidate = 3600

const CURRENT_YEAR = new Date().getFullYear()
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

export const metadata: Metadata = {
  title: `Warhammer Battleforce Tracker ${CURRENT_YEAR} — Prices & Deals`,
  description: `Track all Warhammer Battleforce and Combat Patrol box prices in ${CURRENT_YEAR}. Compare every authorized US retailer and find the best discount off GW RRP.`,
  alternates: { canonical: '/battleforce-tracker' },
}

export default async function BattleforceTrackerPage() {
  const [battleforceProducts, combatPatrolProducts] = await Promise.all([
    getProductsByType(ProductType.battleforce),
    getProductsByType(ProductType.combat_patrol),
  ])

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: `Battleforce Tracker ${CURRENT_YEAR}`, item: `${SITE_URL}/battleforce-tracker` },
        ],
      },
      {
        '@type': 'ItemList',
        name: `Warhammer Battleforce Boxes ${CURRENT_YEAR}`,
        url: `${SITE_URL}/battleforce-tracker`,
        numberOfItems: battleforceProducts.length,
        itemListElement: battleforceProducts.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: `${SITE_URL}/product/${p.slug}`,
        })),
      },
    ],
  }
  const schemaJson = JSON.stringify(itemListSchema).replace(/</g, '\\u003c')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />

      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-bone-faint">
        <a href="/" className="transition-colors hover:text-gold">Home</a>
        <span className="mx-2">/</span>
        <span className="text-bone-muted">Battleforce Tracker</span>
      </nav>

      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-gold/70">Annual Value Boxes</p>
        <h1 className="mt-1 text-3xl font-bold text-bone sm:text-4xl">
          Warhammer Battleforce Tracker {CURRENT_YEAR}
        </h1>
        <p className="mt-2 text-bone-muted">
          Live prices on every Battleforce and Combat Patrol box. Updated every 4 hours.
        </p>
      </div>

      {/* Battleforce Boxes */}
      <section className="mb-12">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-bold text-bone">Battleforce Boxes</h2>
          <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
            {battleforceProducts.length} boxes
          </span>
        </div>
        {battleforceProducts.length === 0 ? (
          <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
            <p className="text-bone-muted">No battleforce boxes found yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {battleforceProducts.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Combat Patrol Boxes */}
      <section className="mb-12">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-bold text-bone">Combat Patrol Boxes</h2>
          <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
            {combatPatrolProducts.length} boxes
          </span>
        </div>
        {combatPatrolProducts.length === 0 ? (
          <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
            <p className="text-bone-muted">No combat patrol boxes found yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {combatPatrolProducts.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Editorial block */}
      <section className="rounded-xl border border-ink-rim bg-ink-card p-8">
        <h2 className="mb-4 text-lg font-bold text-bone">About Battleforce Boxes</h2>
        <div className="space-y-3 text-sm leading-relaxed text-bone-muted">
          <p>
            Warhammer Battleforce boxes are limited annual releases from Games Workshop, typically
            arriving in November for the holiday season. Each box bundles units worth significantly
            more than the RRP if purchased separately — usually delivering 20–35% savings vs
            individual kit prices.
          </p>
          <p>
            Retailers frequently discount Battleforces further below GW RRP, making them one of the
            best value purchases in the hobby. GrimDealz tracks every authorized US retailer so you
            can catch the lowest price the moment it drops.
          </p>
          <p>
            <strong className="text-bone">Combat Patrol boxes</strong> offer a similar value
            proposition — a curated starter force at a discount, perfect for new players or army
            expansion. Unlike Battleforces, Combat Patrols are available year-round.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/deals"
            className="rounded-lg border border-ink-rim bg-ink-raised px-4 py-2 text-sm font-medium text-bone-muted transition-all hover:border-gold/30 hover:text-gold"
          >
            See all deals →
          </Link>
          <Link
            href="/factions"
            className="rounded-lg border border-ink-rim bg-ink-raised px-4 py-2 text-sm font-medium text-bone-muted transition-all hover:border-gold/30 hover:text-gold"
          >
            Browse by faction →
          </Link>
        </div>
      </section>
    </div>
  )
}
