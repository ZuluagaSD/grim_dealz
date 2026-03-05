import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SITE_URL } from '@/lib/resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const type = searchParams.get('type') // 'alert' | 'newsletter' | 'all'
  const productId = searchParams.get('productId')

  if (!token) {
    return NextResponse.redirect(`${SITE_URL}?error=invalid_token`)
  }

  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { unsubscribeToken: token },
  })

  if (!subscriber) {
    return NextResponse.redirect(`${SITE_URL}?error=invalid_token`)
  }

  if (type === 'alert' && productId) {
    // Unsubscribe from a specific product alert
    await prisma.priceAlert.updateMany({
      where: { subscriberId: subscriber.id, productId },
      data: { status: 'unsubscribed' },
    })
  } else if (type === 'newsletter') {
    // Unsubscribe from newsletter
    await prisma.newsletterSubscription.updateMany({
      where: { subscriberId: subscriber.id },
      data: { status: 'unsubscribed' },
    })
  } else {
    // Unsubscribe from everything
    await prisma.priceAlert.updateMany({
      where: { subscriberId: subscriber.id },
      data: { status: 'unsubscribed' },
    })
    await prisma.newsletterSubscription.updateMany({
      where: { subscriberId: subscriber.id },
      data: { status: 'unsubscribed' },
    })
  }

  return NextResponse.redirect(`${SITE_URL}?unsubscribed=true`)
}
