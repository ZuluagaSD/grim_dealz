'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const MESSAGES: Record<string, { text: string; type: 'success' | 'info' }> = {
  verified: { text: 'Email verified! Your subscriptions are now active.', type: 'success' },
  unsubscribed: { text: 'You have been unsubscribed.', type: 'info' },
}

export default function ToastNotification() {
  const searchParams = useSearchParams()
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' } | null>(null)

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setToast(MESSAGES.verified ?? null)
    } else if (searchParams.get('unsubscribed') === 'true') {
      setToast(MESSAGES.unsubscribed ?? null)
    }
  }, [searchParams])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  const bgColor = toast.type === 'success' ? 'bg-green-900/80 border-green-700/50' : 'bg-ink-raised border-ink-rim'

  return (
    <div className={`fixed top-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-6 py-3 shadow-lg backdrop-blur-sm ${bgColor}`}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-bone">{toast.text}</span>
        <button
          onClick={() => setToast(null)}
          className="text-bone-muted transition-colors hover:text-bone"
          aria-label="Dismiss"
        >
          &#10005;
        </button>
      </div>
    </div>
  )
}
