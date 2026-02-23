// Faction page — ISR 6h
import type { Metadata } from 'next'
import ProductCard from '@/components/server/ProductCard'
import { getFactionProducts } from '@/lib/data'

export const revalidate = 21600

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const factionName = params.slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    title: `${factionName} Prices`,
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

  const factionName = params.slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <a href="/" className="hover:text-gray-700">Home</a>
        {' / '}
        <span className="text-gray-900">{factionName}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{factionName}</h1>
        <p className="mt-1 text-gray-600">{products.length} products available</p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          <p className="text-lg font-medium">No products found</p>
          <p className="mt-1 text-sm">
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
