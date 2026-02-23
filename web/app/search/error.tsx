'use client'

import { useEffect } from 'react'

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
      <h2 className="text-2xl font-bold text-gray-900">Search unavailable</h2>
      <p className="mt-2 text-gray-600">Something went wrong with your search.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  )
}
