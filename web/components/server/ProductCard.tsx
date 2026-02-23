import Image from 'next/image'
import Link from 'next/link'
import type { ProductCardData } from '@/lib/types'

interface ProductCardProps {
  product: ProductCardData
}

// Faction → accent color map (bright enough for dark bg)
const FACTION_COLORS: Record<string, string> = {
  'space marines': '#4a7fd4',
  necrons: '#4ade80',
  orks: '#86efac',
  'chaos space marines': '#f87171',
  'death guard': '#a3e635',
  'thousand sons': '#c084fc',
  chaos: '#f87171',
  eldar: '#c084fc',
  aeldari: '#c084fc',
  tau: '#38bdf8',
  "t'au empire": '#38bdf8',
  tyranids: '#fb923c',
  'stormcast eternals': '#fbbf24',
  'adepta sororitas': '#f87171',
  'adeptus mechanicus': '#fb923c',
  'grey knights': '#94a3b8',
  drukhari: '#c084fc',
  'dark angels': '#4ade80',
}

function getFactionColor(faction: string): string {
  return FACTION_COLORS[faction.toLowerCase()] ?? '#a09880'
}

export default function ProductCard({ product }: ProductCardProps) {
  const { cheapestListing } = product
  const factionColor = getFactionColor(product.faction)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-ink-rim bg-ink-card transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-high hover:shadow-lg hover:shadow-black/40">
      {/* Product image */}
      <div className="relative h-48 bg-ink-raised">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-2"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-bone-faint">
            <svg
              className="h-16 w-16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Discount badge */}
        {cheapestListing && cheapestListing.discountPct >= 5 && (
          <div className="absolute left-2 top-2 rounded bg-red-500/90 px-2 py-0.5 text-xs font-bold text-white">
            {Math.round(cheapestListing.discountPct)}% OFF
          </div>
        )}

        {/* All-time low badge */}
        {cheapestListing?.isAllTimeLow && (
          <div className="absolute right-2 top-2 rounded bg-gold px-2 py-0.5 text-xs font-bold text-ink">
            All-Time Low
          </div>
        )}
      </div>

      {/* Product details */}
      <div className="flex flex-1 flex-col p-3">
        <p
          className="mb-1 text-xs font-medium uppercase tracking-wide"
          style={{ color: factionColor }}
        >
          {product.faction}
        </p>
        <Link
          href={`/product/${product.slug}`}
          className="text-sm font-semibold text-bone line-clamp-2 transition-colors group-hover:text-gold"
        >
          {product.name}
          <span className="absolute inset-0" aria-hidden="true" />
        </Link>

        <div className="mt-auto pt-3">
          {cheapestListing ? (
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-lg font-bold text-bone">
                  ${cheapestListing.currentPrice.toFixed(2)}
                </span>
                {cheapestListing.discountPct > 0 && (
                  <span className="ml-1 text-xs text-bone-faint line-through">
                    ${product.gwRrpUsd.toFixed(2)}
                  </span>
                )}
              </div>
              <span className="text-xs text-bone-faint">
                {cheapestListing.storeName}
              </span>
            </div>
          ) : (
            <p className="text-sm text-bone-faint">No prices available</p>
          )}

          {!cheapestListing?.inStock && cheapestListing && (
            <p className="mt-1 text-xs text-orange-400">Out of stock</p>
          )}
        </div>
      </div>
    </div>
  )
}
