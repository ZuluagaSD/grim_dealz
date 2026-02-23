'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { SerializedPricePoint } from '@/lib/types'

interface PriceHistoryChartProps {
  points: SerializedPricePoint[]
  gwRrpUsd: number
}

// Curated palette — hero (cheapest / first) gets strong blue, rest are harmonious Tailwind 500s
const STORE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatPriceTick(value: number): string {
  return `$${value.toFixed(0)}`
}

export default function PriceHistoryChart({ points, gwRrpUsd }: PriceHistoryChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
        <p className="text-sm text-gray-400">
          Price history will appear after a few scrape cycles.
        </p>
      </div>
    )
  }

  // Collect ordered store list (preserves first-seen order)
  const storeOrder: string[] = []
  const storeNames: Record<string, string> = {}
  for (const p of points) {
    if (!storeNames[p.storeSlug]) {
      storeOrder.push(p.storeSlug)
      storeNames[p.storeSlug] = p.storeName
    }
  }

  // Pivot: bucket by date string (YYYY-MM-DD), keep latest price per store per day
  const byDate: Record<string, Record<string, number>> = {}
  for (const p of points) {
    const day = p.date.slice(0, 10)
    if (!byDate[day]) byDate[day] = {}
    byDate[day][p.storeSlug] = p.price
  }

  // Build sorted chart data rows
  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, prices]) => ({ date: day, ...prices }))

  // Extend each store's last known price to today with a flat line
  const today = new Date().toISOString().slice(0, 10)
  if (chartData.length > 0 && chartData[chartData.length - 1]?.date !== today) {
    const lastPrices: Record<string, number> = {}
    for (const row of chartData) {
      for (const slug of storeOrder) {
        const price = (row as Record<string, unknown>)[slug]
        if (typeof price === 'number') lastPrices[slug] = price
      }
    }
    chartData.push({ date: today, ...lastPrices })
  }

  // Y-axis domain: 10% below cheapest, 5% above RRP
  const allPrices = points.map((p) => p.price)
  const minPrice = Math.min(...allPrices)
  const yMin = Math.floor(minPrice * 0.9)
  const yMax = Math.ceil(gwRrpUsd * 1.05)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header: store legend pills + window label */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
        {storeOrder.map((slug, i) => (
          <span
            key={slug}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${STORE_COLORS[i % STORE_COLORS.length]}18`,
              color: STORE_COLORS[i % STORE_COLORS.length],
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: STORE_COLORS[i % STORE_COLORS.length] }}
            />
            {storeNames[slug]}
          </span>
        ))}
        <span className="ml-auto text-xs font-medium text-gray-400">90 days</span>
      </div>

      {/* Chart */}
      <div className="px-2 pb-4 pt-5">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              tickFormatter={formatPriceTick}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              domain={[yMin, yMax]}
              width={52}
            />

            <Tooltip
              content={<CustomTooltip gwRrpUsd={gwRrpUsd} storeNames={storeNames} />}
              cursor={{ stroke: '#e5e7eb', strokeWidth: 1 }}
            />

            {/* GW RRP reference line */}
            <ReferenceLine
              y={gwRrpUsd}
              stroke="#d1d5db"
              strokeDasharray="4 4"
              label={{
                value: `RRP $${gwRrpUsd.toFixed(0)}`,
                position: 'insideTopLeft',
                fontSize: 10,
                fill: '#9ca3af',
                fontWeight: 500,
              }}
            />

            {storeOrder.map((slug, i) => (
              <Line
                key={slug}
                type="monotone"
                dataKey={slug}
                stroke={STORE_COLORS[i % STORE_COLORS.length]}
                strokeWidth={i === 0 ? 2.5 : 1.75}
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: '#fff',
                  fill: STORE_COLORS[i % STORE_COLORS.length],
                }}
                connectNulls={false}
                animationDuration={700}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
  gwRrpUsd: number
  storeNames: Record<string, string>
}

function CustomTooltip({ active, payload, label, gwRrpUsd, storeNames }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null

  // Sort cheapest first so the best deal is always on top
  const sorted = [...payload].sort((a, b) => a.value - b.value)
  const bestPrice = sorted[0]?.value

  return (
    <div className="w-52 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
      <div className="border-b border-gray-50 px-3 py-2">
        <p className="text-xs font-semibold text-gray-500">
          {new Date(label).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
      <div className="divide-y divide-gray-50 px-3 py-1">
        {sorted.map((entry) => {
          const savings = gwRrpUsd - entry.value
          const discountPct = (savings / gwRrpUsd) * 100
          const isBest = entry.value === bestPrice
          return (
            <div key={entry.dataKey} className="flex items-center gap-2 py-1.5">
              <span
                className="h-5 w-0.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
                {storeNames[entry.dataKey] ?? entry.dataKey}
              </span>
              <span className="text-xs font-bold text-gray-900">${entry.value.toFixed(2)}</span>
              {savings > 0 && (
                <span
                  className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: isBest ? '#dcfce7' : '#f0fdf4',
                    color: isBest ? '#15803d' : '#16a34a',
                  }}
                >
                  -{Math.round(discountPct)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
