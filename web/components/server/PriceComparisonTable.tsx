import Link from 'next/link'
import type { SerializedListing } from '@/lib/types'

interface PriceComparisonTableProps {
  listings: SerializedListing[]
  gwRrpUsd: number
  gwUrl?: string | null
}

export default function PriceComparisonTable({
  listings,
  gwRrpUsd,
  gwUrl,
}: PriceComparisonTableProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-lg border border-ink-rim bg-ink-card p-6 text-center text-sm text-bone-muted">
        No prices available yet. Check back soon — scrapers run every 4 hours.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink-rim">
      <table className="min-w-full divide-y divide-ink-rim">
        <thead className="bg-ink-raised">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-bone-faint">
              Store
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bone-faint">
              Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bone-faint">
              vs RRP
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-bone-faint">
              Stock
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bone-faint">
              <span className="sr-only">Buy</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-rim bg-ink-card">
          {/* GW RRP row */}
          <tr className="bg-ink-raised">
            <td className="px-4 py-3 text-sm font-medium text-bone-muted">
              GW Direct (RRP)
            </td>
            <td className="px-4 py-3 text-right text-sm font-semibold text-bone">
              ${gwRrpUsd.toFixed(2)}
            </td>
            <td className="px-4 py-3 text-right text-sm text-bone-faint">—</td>
            <td className="px-4 py-3 text-center text-sm text-bone-faint">—</td>
            <td className="px-4 py-3 text-right">
              {gwUrl && (
                <a
                  href={gwUrl}
                  className="inline-flex items-center rounded border border-ink-rim bg-ink-high px-3 py-1.5 text-xs font-semibold text-bone-muted transition-colors hover:border-bone-faint hover:text-bone"
                  rel="nofollow"
                  target="_blank"
                >
                  Buy →
                </a>
              )}
            </td>
          </tr>

          {listings.map((listing, idx) => (
            <tr
              key={listing.id}
              className={
                idx === 0
                  ? 'bg-green-950/40'
                  : 'hover:bg-ink-raised transition-colors'
              }
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {idx === 0 && (
                    <span className="rounded bg-green-700/80 px-1.5 py-0.5 text-xs font-bold text-green-100">
                      Best
                    </span>
                  )}
                  <span className="text-sm font-medium text-bone">
                    {listing.storeName}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`text-sm font-bold ${idx === 0 ? 'text-green-400' : 'text-bone'}`}>
                  ${listing.currentPrice.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {listing.discountPct > 0 ? (
                  <span className="text-sm font-medium text-green-400">
                    -{Math.round(listing.discountPct)}%
                  </span>
                ) : (
                  <span className="text-sm text-bone-faint">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {listing.inStock ? (
                  <span className="inline-flex items-center rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400">
                    In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-400">
                    {toStockLabel(listing.stockStatus)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/go/${listing.storeSlug}/${listing.id}`}
                  className={`inline-flex items-center rounded px-3 py-1.5 text-xs font-semibold transition-all ${
                    idx === 0
                      ? 'bg-gold text-ink hover:bg-gold-light hover:shadow-gold-glow'
                      : 'border border-ink-rim bg-ink-raised text-bone-muted hover:border-gold/40 hover:text-gold'
                  }`}
                  rel="nofollow sponsored"
                >
                  Buy →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-ink-rim bg-ink-card px-4 py-2 text-xs text-bone-faint">
        Prices verified every 4 hours. GrimDealz earns commissions from qualifying purchases.
      </p>
    </div>
  )
}

function toStockLabel(status: string): string {
  switch (status) {
    case 'out_of_stock':
      return 'Out of Stock'
    case 'backorder':
      return 'Backorder'
    case 'pre_order':
      return 'Pre-Order'
    case 'limited':
      return 'Limited'
    default:
      return 'Unavailable'
  }
}
