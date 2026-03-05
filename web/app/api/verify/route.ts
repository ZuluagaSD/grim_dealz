import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getResend, FROM_EMAIL, SITE_URL } from '@/lib/resend'
import { welcomeAlertEmail, welcomeNewsletterEmail } from '@/lib/email-templates'
import type { AlertEmailProduct } from '@/lib/email-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${SITE_URL}?error=invalid_token`)
  }

  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { verifyToken: token },
    include: {
      priceAlerts: { where: { status: 'pending' }, include: { product: { select: { name: true, id: true } } } },
      newsletterSubscription: true,
    },
  })

  if (!subscriber) {
    return NextResponse.redirect(`${SITE_URL}?error=invalid_token`)
  }

  if (subscriber.emailVerified) {
    return NextResponse.redirect(`${SITE_URL}?verified=already`)
  }

  // Mark email as verified
  await prisma.emailSubscriber.update({
    where: { id: subscriber.id },
    data: { emailVerified: true },
  })

  // Activate all pending price alerts
  if (subscriber.priceAlerts.length > 0) {
    await prisma.priceAlert.updateMany({
      where: { subscriberId: subscriber.id, status: 'pending' },
      data: { status: 'active' },
    })

    // Send welcome email for each activated alert
    for (const alert of subscriber.priceAlerts) {
      const productData = await getAlertEmailProduct(alert.product.id)
      if (!productData) continue

      const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${subscriber.unsubscribeToken}&type=alert&productId=${alert.product.id}`
      void getResend().emails.send({
        from: FROM_EMAIL,
        to: subscriber.email,
        subject: `Price alert set for ${alert.product.name}`,
        html: welcomeAlertEmail(productData, alert.targetPrice?.toString() ?? '0', unsubscribeUrl),
      })
    }
  }

  // Activate newsletter if pending
  if (subscriber.newsletterSubscription?.status === 'pending') {
    await prisma.newsletterSubscription.update({
      where: { subscriberId: subscriber.id },
      data: { status: 'active' },
    })

    const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${subscriber.unsubscribeToken}&type=newsletter`
    void getResend().emails.send({
      from: FROM_EMAIL,
      to: subscriber.email,
      subject: 'Welcome to the GrimDealz Weekly Digest!',
      html: welcomeNewsletterEmail(unsubscribeUrl),
    })
  }

  return NextResponse.redirect(`${SITE_URL}?verified=true`)
}
