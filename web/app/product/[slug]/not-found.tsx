import Link from 'next/link'

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-center">
      <h2 className="text-2xl font-bold text-gray-900">Product Not Found</h2>
      <p className="mt-2 text-gray-600">
        This product doesn&apos;t exist or may have been discontinued.
      </p>
      <Link
        href="/deals"
        className="mt-6 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Browse Deals
      </Link>
    </div>
  )
}
