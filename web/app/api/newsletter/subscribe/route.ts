import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resend, FROM_EMAIL, SITE_URL } from '@/lib/resend'
import { verificationEmail, welcomeNewsletterEmail } from '@/lib/email-templates'
import { isRateLimited, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request)
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  let body: { email?: string }
  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email } = body
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Upsert subscriber
  const subscriber = await prisma.emailSubscriber.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: { email: normalizedEmail },
  })

  // Upsert newsletter subscription (reactivate if previously unsubscribed)
  await prisma.newsletterSubscription.upsert({
    where: { subscriberId: subscriber.id },
    update: {
      status: subscriber.emailVerified ? 'active' : 'pending',
    },
    create: {
      subscriberId: subscriber.id,
      status: subscriber.emailVerified ? 'active' : 'pending',
    },
  })

  // Send verification or welcome email
  if (subscriber.emailVerified) {
    const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${subscriber.unsubscribeToken}&type=newsletter`
    void resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: 'Welcome to the GrimDealz Weekly Digest!',
      html: welcomeNewsletterEmail(unsubscribeUrl),
    })
  } else {
    const verifyUrl = `${SITE_URL}/api/verify?token=${subscriber.verifyToken}`
    void resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: 'Verify your email — GrimDealz',
      html: verificationEmail(verifyUrl),
    })
  }

  return NextResponse.json({
    message: subscriber.emailVerified
      ? 'You\'re subscribed! Check your email for a welcome message.'
      : 'Check your email to verify your subscription.',
  })
}
