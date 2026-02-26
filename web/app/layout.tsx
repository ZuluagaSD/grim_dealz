import type { Metadata } from 'next'
import { Inter, Cinzel } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Link from 'next/link'
import './globals.css'
import MobileNav from '@/components/client/MobileNav'

const inter = Inter({ subsets: ['latin'] })
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-cinzel',
})

export const metadata: Metadata = {
  title: {
    default: 'GrimDealz — Best Warhammer Prices Compared',
    template: '%s | GrimDealz',
  },
  description:
    'Compare Warhammer 40K, Age of Sigmar, and Horus Heresy prices across 10+ authorized US retailers. Find the cheapest price and save up to 25% off GW RRP.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'
  ),
  openGraph: {
    type: 'website',
    siteName: 'GrimDealz',
    title: 'GrimDealz — Best Warhammer Prices Compared',
    description:
      'Compare Warhammer 40K, Age of Sigmar, and Horus Heresy prices across 10+ authorized US retailers. Save up to 25% off GW RRP.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'GrimDealz' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GrimDealz — Best Warhammer Prices Compared',
    description:
      'Compare Warhammer 40K, Age of Sigmar, and Horus Heresy prices across 10+ authorized US retailers.',
    images: ['/og-default.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cinzel.variable}>
      <body className={inter.className}>
        <header className="sticky top-0 z-50 border-b border-ink-rim bg-ink/95 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <Link href="/" className="font-cinzel text-lg font-bold tracking-wider text-gold transition-opacity hover:opacity-80">
                ⚔ GrimDealz
              </Link>

              <nav className="hidden items-center gap-6 sm:flex">
                <Link href="/deals" className="text-sm font-medium text-bone-muted transition-colors hover:text-gold">
                  Deals
                </Link>
                <Link href="/factions" className="text-sm font-medium text-bone-muted transition-colors hover:text-gold">
                  Factions
                </Link>
                <Link href="/battleforce-tracker" className="text-sm font-medium text-bone-muted transition-colors hover:text-gold">
                  Battleforce Tracker
                </Link>
                <Link
                  href="/search"
                  className="rounded-md border border-ink-rim px-3 py-1.5 text-sm font-medium text-bone-muted transition-all hover:border-gold/40 hover:bg-ink-card hover:text-gold"
                >
                  Search
                </Link>
              </nav>

              <MobileNav />
            </div>
          </div>
        </header>

        <main>{children}</main>
        <Analytics />

        <footer className="mt-16 border-t border-ink-rim bg-ink py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/" className="font-cinzel text-base font-bold tracking-wider text-gold">
                ⚔ GrimDealz
              </Link>
              <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-bone-muted">
                <Link href="/deals" className="transition-colors hover:text-gold">Deals</Link>
                <Link href="/factions" className="transition-colors hover:text-gold">Factions</Link>
                <Link href="/battleforce-tracker" className="transition-colors hover:text-gold">Battleforce Tracker</Link>
                <Link href="/search" className="transition-colors hover:text-gold">Search</Link>
                <Link href="/privacy" className="transition-colors hover:text-gold">Privacy</Link>
              </nav>
            </div>
            {/* Game system links — de-orphan these pages */}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-bone-faint">
              <Link href="/game/warhammer-40k" className="transition-colors hover:text-gold">Warhammer 40,000</Link>
              <Link href="/game/age-of-sigmar" className="transition-colors hover:text-gold">Age of Sigmar</Link>
              <Link href="/game/horus-heresy" className="transition-colors hover:text-gold">Horus Heresy</Link>
              <Link href="/game/the-old-world" className="transition-colors hover:text-gold">The Old World</Link>
            </div>
            <div className="mt-6 border-t border-ink-rim pt-6 text-xs text-bone-faint">
              <p>
                GrimDealz earns commissions from qualifying purchases via affiliate
                links. Prices verified via automated scraping every 4 hours.
              </p>
              <p className="mt-1">
                Not affiliated with Games Workshop. All product names are trademarks
                of Games Workshop Ltd.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
