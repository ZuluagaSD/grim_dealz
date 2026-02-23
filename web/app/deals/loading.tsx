export default function DealsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3">
            <div className="mb-3 aspect-square rounded bg-gray-200" />
            <div className="h-3 w-16 rounded bg-gray-200 mb-2" />
            <div className="h-4 w-full rounded bg-gray-200 mb-1" />
            <div className="h-4 w-3/4 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
