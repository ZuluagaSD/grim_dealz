'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { SerializedPricePoint } from '@/lib/types'

interface PriceHistoryChartProps {
  points: SerializedPricePoint[]
  gwRrpUsd: number
}

// One color per store — ordered by first appearance
const STORE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`
}

export default function PriceHistoryChart({ points, gwRrpUsd }: PriceHistoryChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400">
        Price history will appear here after a few scrape cycles.
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

  // Y-axis domain: 10% below cheapest, 5% above RRP
  const allPrices = points.map((p) => p.price)
  const minPrice = Math.min(...allPrices)
  const yMin = Math.floor(minPrice * 0.9)
  const yMax = Math.ceil(gwRrpUsd * 1.05)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <defs>
            {storeOrder.map((slug, i) => (
              <linearGradient key={slug} id={`grad-${slug}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={STORE_COLORS[i % STORE_COLORS.length]} stopOpacity={0.15} />
                <stop offset="95%" stopColor={STORE_COLORS[i % STORE_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={formatPrice}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            domain={[yMin, yMax]}
            width={56}
          />

          <Tooltip
            content={<CustomTooltip gwRrpUsd={gwRrpUsd} storeNames={storeNames} />}
          />
          <Legend
            formatter={(value) => storeNames[value] ?? value}
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />

          {/* GW RRP reference line */}
          <ReferenceLine
            y={gwRrpUsd}
            stroke="#9ca3af"
            strokeDasharray="6 3"
            label={{ value: `RRP $${gwRrpUsd.toFixed(0)}`, position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
          />

          {storeOrder.map((slug, i) => (
            <Line
              key={slug}
              type="monotone"
              dataKey={slug}
              stroke={STORE_COLORS[i % STORE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: STORE_COLORS[i % STORE_COLORS.length] }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
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

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-gray-500">
        {new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
      {payload.map((entry) => {
        const savings = gwRrpUsd - entry.value
        const discountPct = (savings / gwRrpUsd) * 100
        return (
          <div key={entry.dataKey} className="flex items-baseline gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-gray-600">{storeNames[entry.dataKey] ?? entry.dataKey}</span>
            <span className="ml-auto pl-4 text-xs font-bold text-gray-900">${entry.value.toFixed(2)}</span>
            {savings > 0 && (
              <span className="text-xs font-medium text-green-600">-{Math.round(discountPct)}%</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
