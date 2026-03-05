import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set — email sending will fail')
}

export const resend = new Resend(process.env.RESEND_API_KEY)

export const FROM_EMAIL =
  process.env.EMAIL_FROM ?? 'GrimDealz <alerts@grimdealz.com>'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'
