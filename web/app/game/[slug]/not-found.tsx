import Link from 'next/link'

export default function GameNotFound() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
      <p className="font-cinzel text-5xl font-bold text-gold/30">404</p>
      <h1 className="mt-4 text-2xl font-bold text-bone">Game System Not Found</h1>
      <p className="mt-2 text-bone-muted">
        That game system doesn&apos;t exist. Browse all available game systems below.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {['warhammer-40k', 'age-of-sigmar', 'horus-heresy', 'the-old-world'].map((slug) => (
          <Link
            key={slug}
            href={`/game/${slug}`}
            className="rounded-lg border border-ink-rim bg-ink-card px-4 py-2 text-sm font-medium text-bone-muted transition-all hover:border-gold/30 hover:bg-ink-raised hover:text-gold"
          >
            {slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <Link href="/" className="text-sm text-gold/70 transition-colors hover:text-gold">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
