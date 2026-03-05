'use client'

import { useState, type FormEvent } from 'react'

interface PriceAlertFormProps {
  productId: string
  productName: string
  currentLowestPrice: number | null
}

type FormState = 'idle' | 'loading' | 'success' | 'error'

export default function PriceAlertForm({
  productId,
  productName,
  currentLowestPrice,
}: PriceAlertFormProps) {
  const [email, setEmail] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setState('loading')

    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          productId,
          ...(targetPrice ? { targetPrice: parseFloat(targetPrice) } : {}),
        }),
      })

      const data = (await res.json()) as { message?: string; error?: string }

      if (!res.ok) {
        setState('error')
        setMessage(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setState('success')
      setMessage(data.message ?? 'Check your email to verify.')
    } catch {
      setState('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-xl border border-gold/20 bg-ink-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-900/40 text-lg text-green-400">
            &#10003;
          </span>
          <div>
            <p className="font-semibold text-bone">{message}</p>
            <p className="mt-1 text-sm text-bone-muted">
              We&apos;ll email you when {productName} drops in price.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-ink-rim bg-ink-card p-6">
      <h3 className="text-lg font-bold text-bone">Get Price Drop Alerts</h3>
      <p className="mt-1 text-sm text-bone-muted">
        Get notified when {productName} drops in price.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label htmlFor="alert-email" className="sr-only">
            Email address
          </label>
          <input
            id="alert-email"
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink-rim bg-ink px-4 py-2.5 text-sm text-bone placeholder:text-bone-faint focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/50"
          />
        </div>

        {currentLowestPrice !== null && (
          <div>
            <label htmlFor="target-price" className="block text-xs text-bone-muted mb-1">
              Target price (optional) — currently ${currentLowestPrice.toFixed(2)}
            </label>
            <input
              id="target-price"
              type="number"
              step="0.01"
              min="0"
              max={currentLowestPrice}
              placeholder={`e.g. ${(currentLowestPrice * 0.9).toFixed(2)}`}
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="w-full rounded-lg border border-ink-rim bg-ink px-4 py-2.5 text-sm text-bone placeholder:text-bone-faint focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/50"
            />
          </div>
        )}

        {state === 'error' && (
          <p className="text-sm text-red-400">{message}</p>
        )}

        <button
          type="submit"
          disabled={state === 'loading'}
          className="w-full rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-ink transition-all hover:bg-gold-light hover:shadow-gold-glow disabled:opacity-50"
        >
          {state === 'loading' ? 'Setting alert...' : 'Notify Me When Price Drops'}
        </button>
      </form>
    </div>
  )
}
