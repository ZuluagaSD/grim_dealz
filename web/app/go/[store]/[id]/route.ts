import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// UUID v4 regex — validates listing IDs before DB lookup
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  { params }: { params: { store: string; id: string } }
): Promise<NextResponse> {
  const { store, id } = params

  if (!UUID_RE.test(id)) {
    return new NextResponse('Invalid listing ID', { status: 400 })
  }

  const listing = await prisma.listing.findFirst({
    where: {
      id,
      store: { slug: store, isActive: true }, // validate store slug matches listing
    },
    select: {
      id: true,
      affiliateUrl: true,
      storeProductUrl: true,
    },
  })

  if (!listing) {
    return NextResponse.redirect(
      new URL('/', request.nextUrl.origin),
      {
        status: 302,
        headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      }
    )
  }

  const destination =
    listing.affiliateUrl ??
    listing.storeProductUrl ??
    '/'

  // Fire-and-forget click log — explicit void satisfies no-floating-promises
  void logClick(listing.id)

  return NextResponse.redirect(
    destination.startsWith('/') ? new URL(destination, request.nextUrl.origin) : destination,
    {
      status: 302,
      headers: {
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  )
}

async function logClick(listingId: string): Promise<void> {
  try {
    await prisma.clickEvent.create({
      data: { listingId },
    })
  } catch {
    // Click logging is non-critical — swallow errors silently
  }
}
