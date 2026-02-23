export default function GameSystemLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-6">
        <div className="h-9 w-64 rounded bg-ink-raised" />
        <div className="mt-2 h-4 w-48 rounded bg-ink-raised" />
      </div>

      {/* Faction pills skeleton */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-24 rounded-full bg-ink-raised" />
        ))}
      </div>

      {/* Product grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-ink-rim bg-ink-card p-3">
            <div className="mb-3 aspect-square rounded bg-ink-raised" />
            <div className="mb-2 h-3 w-16 rounded bg-ink-raised" />
            <div className="mb-1 h-4 w-full rounded bg-ink-raised" />
            <div className="h-4 w-3/4 rounded bg-ink-raised" />
          </div>
        ))}
      </div>
    </div>
  )
}
