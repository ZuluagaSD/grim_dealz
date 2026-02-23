// Homepage — ISR 1h
// Populated in Phase 2 Week 5 after DB + scrapers are live
export const revalidate = 3600

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          ⚔️ GrimDealz
        </h1>
        <p className="mt-4 text-xl text-gray-600">
          Compare Warhammer prices across 10+ US retailers.
        </p>
        <p className="mt-2 text-lg text-gray-500">
          Save up to 25% off GW RRP — automatically.
        </p>
        <div className="mt-8 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          🚧 Coming soon — scrapers running, prices loading.
        </div>
      </div>
    </div>
  )
}
