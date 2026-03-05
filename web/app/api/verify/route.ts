import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resend, FROM_EMAIL, SITE_URL } from '@/lib/resend'
import { welcomeAlertEmail, welcomeNewsletterEmail } from '@/lib/email-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${subscriber.unsubscribeToken}&type=alert&productId=${alert.product.id}`
      void resend.emails.send({
        from: FROM_EMAIL,
        to: subscriber.email,
        subject: `Price alert set for ${alert.product.name}`,
        html: welcomeAlertEmail(alert.product.name, unsubscribeUrl),
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
    void resend.emails.send({
      from: FROM_EMAIL,
      to: subscriber.email,
      subject: 'Welcome to the GrimDealz Weekly Digest!',
      html: welcomeNewsletterEmail(unsubscribeUrl),
    })
  }

  return NextResponse.redirect(`${SITE_URL}?verified=true`)
}
