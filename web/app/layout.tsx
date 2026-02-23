import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <a href="/" className="text-xl font-bold text-gray-900">
                ⚔️ GrimDealz
              </a>
              <nav className="hidden space-x-6 text-sm font-medium text-gray-600 sm:flex">
                <a href="/deals" className="hover:text-gray-900">
                  Deals
                </a>
                <a href="/faction/space-marines" className="hover:text-gray-900">
                  Factions
                </a>
                <a href="/battleforce-tracker" className="hover:text-gray-900">
                  Battleforce Tracker
                </a>
                <a href="/search" className="hover:text-gray-900">
                  Search
                </a>
              </nav>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="mt-16 border-t border-gray-200 bg-gray-50 py-8 text-center text-xs text-gray-500">
          <p>
            GrimDealz earns commissions from qualifying purchases via affiliate
            links. Prices verified via automated scraping every 4 hours.
          </p>
          <p className="mt-1">
            Not affiliated with Games Workshop. All product names are trademarks
            of Games Workshop Ltd.
          </p>
        </footer>
      </body>
    </html>
  )
}
