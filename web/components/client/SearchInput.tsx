'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Suggestion } from '@/app/api/search/suggestions/route'

interface SearchInputProps {
  defaultValue?: string
}

export default function SearchInput({ defaultValue = '' }: SearchInputProps) {
  const router = useRouter()
  const [query, setQuery] = useState(defaultValue)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (q.trim().length < 2) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      const signal = abortRef.current.signal

      void fetch(`/api/search/suggestions?q=${encodeURIComponent(q.trim())}`, { signal })
        .then(async (res) => {
          if (!res.ok) return
          const data = (await res.json()) as { suggestions: Suggestion[] }
          setSuggestions(data.suggestions)
          setIsOpen(data.suggestions.length > 0)
          setActiveIndex(-1)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
        })
    }, 300)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    fetchSuggestions(val)
  }

  function navigateToProduct(slug: string) {
    setIsOpen(false)
    setSuggestions([])
    router.push(`/product/${slug}`)
  }

  function navigateToSearch() {
    setIsOpen(false)
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const active = suggestions[activeIndex]
      if (active) {
        navigateToProduct(active.slug)
      } else {
        navigateToSearch()
      }
    }
  }

  return (
    <div ref={containerRef} className="relative mb-8">
      <div className="flex gap-3">
        <input
          name="q"
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true) }}
          placeholder="Search products, factions, game systems..."
          autoComplete="off"
          className="flex-1 rounded-lg border border-ink-rim bg-ink-card px-4 py-2.5 text-base text-bone placeholder:text-bone-faint focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/20"
        />
        <button
          type="button"
          onClick={navigateToSearch}
          className="rounded-lg bg-gold px-5 py-2.5 text-base font-semibold text-ink transition-all hover:bg-gold-light hover:shadow-gold-glow"
        >
          Search
        </button>
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-ink-rim bg-ink-card shadow-lg shadow-black/50">
          {suggestions.map((s, i) => (
            <li key={s.slug}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  navigateToProduct(s.slug)
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${
                  i === activeIndex
                    ? 'bg-ink-raised text-bone'
                    : 'text-bone-muted hover:bg-ink-raised hover:text-bone'
                }`}
              >
                <span className="truncate text-sm font-medium">{s.name}</span>
                <span className="ml-4 shrink-0 text-xs text-bone-faint">{s.faction}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
