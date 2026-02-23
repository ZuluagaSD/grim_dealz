// Factions hub — ISR 24h (faction list rarely changes)
import type { Metadata } from 'next'
import Link from 'next/link'
import { getFactions } from '@/lib/data'
import type { FactionSummary } from '@/lib/types'

export const revalidate = 86400

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

export const metadata: Metadata = {
  title: 'All Warhammer Factions — Browse Prices by Faction',
  description: 'Browse all Warhammer factions and compare prices across 10+ authorized US retailers. Find the best deals on Space Marines, Necrons, Stormcast Eternals, and more.',
  alternates: { canonical: '/factions' },
}

// Display order for game systems
const GAME_SYSTEM_ORDER = [
  'Warhammer 40K',
  'Age of Sigmar',
  'Horus Heresy',
  'The Old World',
]

function groupByGameSystem(factions: FactionSummary[]): Map<string, FactionSummary[]> {
  const map = new Map<string, FactionSummary[]>()
  for (const f of factions) {
    const existing = map.get(f.gameSystem) ?? []
    existing.push(f)
    map.set(f.gameSystem, existing)
  }
  return map
}

export default async function FactionsPage() {
  const factions = await getFactions()
  const grouped = groupByGameSystem(factions)

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Factions', item: `${SITE_URL}/factions` },
    ],
  }
  const schemaJson = JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c')

  // Ordered list of game systems that have at least one faction
  const orderedSystems = [
    ...GAME_SYSTEM_ORDER.filter((gs) => grouped.has(gs)),
    ...Array.from(grouped.keys()).filter((gs) => !GAME_SYSTEM_ORDER.includes(gs)).sort(),
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />

      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-bone-faint">
        <a href="/" className="transition-colors hover:text-gold">Home</a>
        <span className="mx-2">/</span>
        <span className="text-bone-muted">Factions</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bone sm:text-4xl">Browse by Faction</h1>
        <p className="mt-2 text-bone-muted">
          {factions.length} factions across {orderedSystems.length} game systems
        </p>
      </div>

      {factions.length === 0 ? (
        <div className="rounded-lg border border-ink-rim bg-ink-card p-12 text-center">
          <p className="text-bone-muted">No factions found yet. Check back once products are seeded.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {orderedSystems.map((gameSystem) => {
            const systemFactions = grouped.get(gameSystem) ?? []
            return (
              <section key={gameSystem}>
                <h2 className="mb-4 border-b border-ink-rim pb-2 text-lg font-bold text-gold">
                  {gameSystem}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {systemFactions.map((f) => (
                    <Link
                      key={f.slug}
                      href={`/faction/${f.slug}`}
                      className="group rounded-lg border border-ink-rim bg-ink-card p-4 transition-all hover:border-ink-high hover:bg-ink-raised"
                    >
                      <p className="text-sm font-semibold text-bone transition-colors group-hover:text-gold line-clamp-2">
                        {f.faction}
                      </p>
                      <p className="mt-1 text-xs text-bone-faint">
                        {f.productCount} product{f.productCount !== 1 ? 's' : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
