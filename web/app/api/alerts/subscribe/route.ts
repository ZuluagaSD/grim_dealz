import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getResend, FROM_EMAIL, SITE_URL } from '@/lib/resend'
import { verificationEmail, welcomeAlertEmail } from '@/lib/email-templates'
import type { AlertEmailProduct } from '@/lib/email-templates'
import { isRateLimited, getClientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SubscribeBody {
  email: string
  productId: string
  targetPrice: number
}

async function getAlertEmailProduct(productId: string): Promise<AlertEmailProduct | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      name: true,
      slug: true,
      imageUrl: true,
      faction: true,
      gameSystem: true,
      gwRrpUsd: true,
      listings: {
        where: { inStock: true, store: { isActive: true } },
        include: { store: { select: { name: true } } },
        orderBy: { currentPrice: 'asc' },
        take: 1,
      },
    },
  })
  if (!product) return null

  type PriceRow = { scraped_at: Date | string; price: string }
  const priceHistory = await prisma.$queryRaw<PriceRow[]>`
    SELECT ph.scraped_at, ph.price::text
    FROM price_history ph
    JOIN listings l ON l.id = ph.listing_id
    JOIN products p ON p.id = l.product_id
    WHERE p.id = ${productId}
      AND ph.scraped_at >= NOW() - INTERVAL '90 days'
    ORDER BY ph.scraped_at ASC
  `

  const cheapest = product.listings[0]
  return {
    name: product.name,
    slug: product.slug,
    imageUrl: product.imageUrl,
    faction: product.faction,
    gameSystem: product.gameSystem,
    gwRrpUsd: Number(product.gwRrpUsd),
    currentPrice: cheapest ? Number(cheapest.currentPrice) : null,
    storeName: cheapest ? cheapest.store.name : null,
    priceHistory: priceHistory.map((r) => ({
      date: typeof r.scraped_at === 'string' ? r.scraped_at : r.scraped_at.toISOString(),
      price: parseFloat(r.price),
    })),
  }
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
  if (targetPrice == null || targetPrice <= 0) {
    return NextResponse.json({ error: 'Target price is required.' }, { status: 400 })
  }

  // Fetch rich product data for email
  const product = await getAlertEmailProduct(productId)
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
        productId,
      },
    },
    update: {
      status: subscriber.emailVerified ? 'active' : 'pending',
      targetPrice,
    },
    create: {
      subscriberId: subscriber.id,
      productId,
      targetPrice,
      status: subscriber.emailVerified ? 'active' : 'pending',
    },
  })

  // Send verification or welcome email
  if (subscriber.emailVerified) {
    const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${subscriber.unsubscribeToken}&type=alert&productId=${productId}`
    void getResend().emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `Price alert set for ${product.name}`,
      html: welcomeAlertEmail(product, targetPrice.toFixed(2), unsubscribeUrl),
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
