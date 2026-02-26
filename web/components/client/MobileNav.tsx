'use client'

import { useState } from 'react'

export default function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-2 text-bone-muted transition-colors hover:text-gold"
        aria-label="Toggle navigation menu"
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-ink-rim bg-ink-card shadow-xl shadow-black/60">
          <nav className="flex flex-col py-1">
            {[
              { href: '/deals', label: 'Deals' },
              { href: '/factions', label: 'Factions' },
              { href: '/battleforce-tracker', label: 'Battleforce Tracker' },
              { href: '/search', label: 'Search' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-bone-muted transition-colors hover:bg-ink-raised hover:text-gold"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
