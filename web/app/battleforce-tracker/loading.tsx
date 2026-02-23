export default function BattleforceTrackerLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-8">
        <div className="mb-2 h-3 w-32 rounded bg-ink-raised" />
        <div className="h-9 w-80 rounded bg-ink-raised" />
        <div className="mt-2 h-4 w-64 rounded bg-ink-raised" />
      </div>

      {/* Battleforce section skeleton */}
      <section className="mb-12">
        <div className="mb-4 h-6 w-48 rounded bg-ink-raised" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-ink-rim bg-ink-card p-3">
              <div className="mb-3 aspect-square rounded bg-ink-raised" />
              <div className="mb-2 h-3 w-16 rounded bg-ink-raised" />
              <div className="mb-1 h-4 w-full rounded bg-ink-raised" />
              <div className="h-4 w-3/4 rounded bg-ink-raised" />
            </div>
          ))}
        </div>
      </section>

      {/* Combat Patrol section skeleton */}
      <section className="mb-12">
        <div className="mb-4 h-6 w-56 rounded bg-ink-raised" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-ink-rim bg-ink-card p-3">
              <div className="mb-3 aspect-square rounded bg-ink-raised" />
              <div className="mb-2 h-3 w-16 rounded bg-ink-raised" />
              <div className="mb-1 h-4 w-full rounded bg-ink-raised" />
              <div className="h-4 w-3/4 rounded bg-ink-raised" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
