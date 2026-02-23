// Search page — SSR (each query is unique, no useful caching)
import type { Metadata } from 'next'
import Link from 'next/link'
import ProductCard from '@/components/server/ProductCard'
import { searchProducts } from '@/lib/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Warhammer products across all game systems and factions.',
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const query = searchParams.q?.trim() ?? ''
  const results = query ? await searchProducts(query, 24) : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Search</h1>

      {/* Search form */}
      <form method="GET" className="mb-8">
        <div className="flex gap-3">
          <input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search products, factions, game systems..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoComplete="off"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-base font-semibold text-white hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </form>

      {/* Results */}
      {query && (
        <div>
          <p className="mb-4 text-sm text-gray-600">
            {results.length === 0
              ? `No results for &quot;${query}&quot;`
              : `${results.length} results for &quot;${query}&quot;`}
          </p>

          {results.length === 0 ? (
            <div className="rounded-lg border border-gray-200 p-8 text-center text-gray-500">
              <p className="text-lg font-medium">No results found</p>
              <p className="mt-1 text-sm">
                Try searching for a faction, product name, or game system.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {['Space Marines', 'Necrons', 'Age of Sigmar', 'Horus Heresy', 'Paints'].map(
                  (suggestion) => (
                    <Link
                      key={suggestion}
                      href={`/search?q=${encodeURIComponent(suggestion)}`}
                      className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                    >
                      {suggestion}
                    </Link>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state — no query yet */}
      {!query && (
        <div className="text-center text-gray-500">
          <p>Start typing to search 3,000+ Warhammer products.</p>
          <p className="mt-4 text-sm font-medium text-gray-700">Popular searches:</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {[
              'Space Marines', 'Combat Patrol', 'Battleforce', 'Necrons',
              'Age of Sigmar', 'Codex', 'Paints', 'Horus Heresy',
            ].map((s) => (
              <Link
                key={s}
                href={`/search?q=${encodeURIComponent(s)}`}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
