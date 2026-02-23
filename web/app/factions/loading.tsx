export default function FactionsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-8">
        <div className="h-9 w-64 rounded bg-ink-raised" />
        <div className="mt-2 h-4 w-48 rounded bg-ink-raised" />
      </div>

      {[8, 6, 4].map((count, i) => (
        <section key={i} className="mb-10">
          <div className="mb-4 h-6 w-40 rounded bg-ink-raised" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: count }).map((_, j) => (
              <div key={j} className="rounded-lg border border-ink-rim bg-ink-card p-4">
                <div className="mb-2 h-4 w-full rounded bg-ink-raised" />
                <div className="h-3 w-16 rounded bg-ink-raised" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
