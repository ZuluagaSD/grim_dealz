'use client'

import { useState, type FormEvent } from 'react'

type FormState = 'idle' | 'loading' | 'success' | 'error'

export default function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setState('loading')

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = (await res.json()) as { message?: string; error?: string }

      if (!res.ok) {
        setState('error')
        setMessage(data.error ?? 'Something went wrong.')
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
      <div className="flex items-center gap-2 text-sm text-green-400">
        <span>&#10003;</span>
        <span>{message}</span>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-bone">Weekly Price Digest</h3>
      <p className="mt-1 text-xs text-bone-faint">
        Top deals, price trends &amp; new products — every week.
      </p>
      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-ink-rim bg-ink px-3 py-1.5 text-sm text-bone placeholder:text-bone-faint focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/50"
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="whitespace-nowrap rounded-md bg-gold px-4 py-1.5 text-sm font-semibold text-ink transition-all hover:bg-gold-light hover:shadow-gold-glow disabled:opacity-50"
        >
          {state === 'loading' ? '...' : 'Subscribe'}
        </button>
      </form>
      {state === 'error' && (
        <p className="mt-1 text-xs text-red-400">{message}</p>
      )}
    </div>
  )
}
