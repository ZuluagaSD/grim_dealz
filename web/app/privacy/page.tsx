import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'GrimDealz privacy policy and affiliate disclosure.',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: February 2026</p>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Affiliate Disclosure</h2>
        <p className="text-gray-700">
          GrimDealz participates in affiliate programs. When you click a retailer link on this site
          and make a purchase, we may earn a small commission at no additional cost to you. This
          helps us keep the site free and cover scraping infrastructure costs.
        </p>
        <p className="text-gray-700">
          Affiliate relationships do not influence price data, product rankings, or editorial
          content. Prices are sourced automatically and reflect what retailers actually charge.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Data We Collect</h2>
        <p className="text-gray-700">
          GrimDealz collects minimal data:
        </p>
        <ul className="list-disc pl-5 text-gray-700 space-y-2">
          <li>
            <strong>Click events:</strong> When you click a retailer link, we record the
            listing ID and timestamp. We do not store your IP address, browser, location, or
            any personal information.
          </li>
          <li>
            <strong>Analytics:</strong> We use privacy-friendly analytics (Plausible or similar)
            that do not use cookies and do not track individuals across sites.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Cookies</h2>
        <p className="text-gray-700">
          GrimDealz does not set cookies for tracking or advertising purposes.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Third-Party Links</h2>
        <p className="text-gray-700">
          This site links to third-party retailers. Once you leave GrimDealz, that retailer&apos;s
          privacy policy applies. We are not responsible for the privacy practices of external sites.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
        <p className="text-gray-700">
          Questions about this policy? Reach us at{' '}
          <a href="mailto:hello@grimdealz.com" className="text-blue-600 hover:underline">
            hello@grimdealz.com
          </a>
          .
        </p>
      </section>
    </div>
  )
}
