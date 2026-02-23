import type { Metadata } from 'next'
import { Inter, Cinzel } from 'next/font/google'
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
              <a href="/" className="font-cinzel text-lg font-bold tracking-wider text-gold transition-opacity hover:opacity-80">
                ⚔ GrimDealz
              </a>

              <nav className="hidden items-center gap-6 sm:flex">
                <a href="/deals" className="text-sm font-medium text-bone-muted transition-colors hover:text-gold">
                  Deals
                </a>
                <a href="/faction/space-marines" className="text-sm font-medium text-bone-muted transition-colors hover:text-gold">
                  Factions
                </a>
                <a href="/battleforce-tracker" className="text-sm font-medium text-bone-muted transition-colors hover:text-gold">
                  Battleforce Tracker
                </a>
                <a
                  href="/search"
                  className="rounded-md border border-ink-rim px-3 py-1.5 text-sm font-medium text-bone-muted transition-all hover:border-gold/40 hover:bg-ink-card hover:text-gold"
                >
                  Search
                </a>
              </nav>

              <MobileNav />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="mt-16 border-t border-ink-rim bg-ink py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <a href="/" className="font-cinzel text-base font-bold tracking-wider text-gold">
                ⚔ GrimDealz
              </a>
              <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-bone-muted">
                <a href="/deals" className="transition-colors hover:text-gold">Deals</a>
                <a href="/factions" className="transition-colors hover:text-gold">Factions</a>
                <a href="/battleforce-tracker" className="transition-colors hover:text-gold">Battleforce Tracker</a>
                <a href="/search" className="transition-colors hover:text-gold">Search</a>
                <a href="/privacy" className="transition-colors hover:text-gold">Privacy</a>
              </nav>
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
