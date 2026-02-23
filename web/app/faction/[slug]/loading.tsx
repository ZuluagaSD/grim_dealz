export default function FactionLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-32 rounded bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="aspect-square rounded bg-gray-200" />
            <div className="mt-3 h-4 w-3/4 rounded bg-gray-200" />
            <div className="mt-2 h-5 w-1/2 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
