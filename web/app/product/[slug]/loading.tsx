export default function ProductLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="aspect-square rounded-xl bg-gray-200" />
        <div className="space-y-4">
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-8 w-3/4 rounded bg-gray-200" />
          <div className="h-10 w-32 rounded bg-gray-200" />
          <div className="h-12 w-full rounded bg-gray-200" />
        </div>
      </div>
      <div className="mt-10 h-48 rounded-lg bg-gray-200" />
    </div>
  )
}
