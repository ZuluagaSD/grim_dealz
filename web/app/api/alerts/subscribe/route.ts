import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getResend, FROM_EMAIL, SITE_URL } from '@/lib/resend'
import { verificationEmail, welcomeAlertEmail } from '@/lib/email-templates'
import { isRateLimited, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SubscribeBody {
  email: string
  productId: string
  targetPrice?: number
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request)
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  let body: SubscribeBody
  try {
    body = (await request.json()) as SubscribeBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, productId, targetPrice } = body

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 })
  }
  if (!productId) {
    return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
  }

  // Validate product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true },
  })
  if (!product) {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Upsert subscriber
  const subscriber = await prisma.emailSubscriber.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: { email: normalizedEmail },
  })

  // Upsert price alert (reactivate if previously unsubscribed)
  await prisma.priceAlert.upsert({
    where: {
      subscriberId_productId: {
        subscriberId: subscriber.id,
        productId: product.id,
      },
    },
    update: {
      status: subscriber.emailVerified ? 'active' : 'pending',
      targetPrice: targetPrice ?? null,
    },
    create: {
      subscriberId: subscriber.id,
      productId: product.id,
      targetPrice: targetPrice ?? null,
      status: subscriber.emailVerified ? 'active' : 'pending',
    },
  })

  // Send verification or welcome email
  if (subscriber.emailVerified) {
    const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${subscriber.unsubscribeToken}&type=alert&productId=${product.id}`
    void getResend().emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `Price alert set for ${product.name}`,
      html: welcomeAlertEmail(product.name, unsubscribeUrl),
    })
  } else {
    const verifyUrl = `${SITE_URL}/api/verify?token=${subscriber.verifyToken}`
    void getResend().emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: 'Verify your email — GrimDealz',
      html: verificationEmail(verifyUrl),
    })
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({
    message: subscriber.emailVerified
      ? 'Price alert activated! Check your email for confirmation.'
      : 'Check your email to verify your subscription.',
  })
}
