import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export type Suggestion = {
  name: string
  slug: string
  faction: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      name: { contains: q, mode: 'insensitive' },
    },
    select: { name: true, slug: true, faction: true },
    orderBy: { name: 'asc' },
    take: 8,
  })

  return NextResponse.json({ suggestions: products })
}
