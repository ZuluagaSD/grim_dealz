'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

interface FactionFilterProps {
  factions: string[]
  gameSystems: string[]
  selectedFaction?: string
  selectedGameSystem?: string
}

export default function FactionFilter({
  factions,
  gameSystems,
  selectedFaction,
  selectedGameSystem,
}: FactionFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  return (
    <div className="flex flex-wrap gap-3">
      {/* Game system filter */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="game-system-filter"
          className="text-sm font-medium text-gray-700"
        >
          Game:
        </label>
        <select
          id="game-system-filter"
          value={selectedGameSystem ?? ''}
          onChange={(e) => updateFilter('gameSystem', e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Games</option>
          {gameSystems.map((gs) => (
            <option key={gs} value={gs}>
              {gs}
            </option>
          ))}
        </select>
      </div>

      {/* Faction filter */}
      {factions.length > 0 && (
        <div className="flex items-center gap-2">
          <label
            htmlFor="faction-filter"
            className="text-sm font-medium text-gray-700"
          >
            Faction:
          </label>
          <select
            id="faction-filter"
            value={selectedFaction ?? ''}
            onChange={(e) => updateFilter('faction', e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Factions</option>
            {factions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Clear filters */}
      {(selectedFaction ?? selectedGameSystem) && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete('faction')
            params.delete('gameSystem')
            router.push(`?${params.toString()}`, { scroll: false })
          }}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
