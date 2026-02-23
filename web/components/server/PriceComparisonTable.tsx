import Link from 'next/link'
import type { SerializedListing } from '@/lib/types'

interface PriceComparisonTableProps {
  listings: SerializedListing[]
  gwRrpUsd: number
}

export default function PriceComparisonTable({
  listings,
  gwRrpUsd,
}: PriceComparisonTableProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-500">
        No prices available yet. Check back soon — scrapers run every 4 hours.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Store
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
              Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
              vs RRP
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
              Stock
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
              <span className="sr-only">Buy</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {/* GW RRP row */}
          <tr className="bg-gray-50">
            <td className="px-4 py-3 text-sm font-medium text-gray-700">
              GW Direct (RRP)
            </td>
            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
              ${gwRrpUsd.toFixed(2)}
            </td>
            <td className="px-4 py-3 text-right text-sm text-gray-400">—</td>
            <td className="px-4 py-3 text-center text-sm text-gray-400">—</td>
            <td className="px-4 py-3" />
          </tr>

          {listings.map((listing, idx) => (
            <tr
              key={listing.id}
              className={idx === 0 ? 'bg-green-50' : undefined}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {idx === 0 && (
                    <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs font-bold text-white">
                      Best
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {listing.storeName}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-bold text-gray-900">
                  ${listing.currentPrice.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {listing.discountPct > 0 ? (
                  <span className="text-sm font-medium text-green-700">
                    -{Math.round(listing.discountPct)}%
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {listing.inStock ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                    {toStockLabel(listing.stockStatus)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/go/${listing.storeSlug}/${listing.id}`}
                  className="inline-flex items-center rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  rel="nofollow sponsored"
                >
                  Buy →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
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
