import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.REVALIDATE_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Accept optional { tags: string[] } to revalidate specific tags
  // Default: revalidate all deal and product caches after a scrape run
  const tags: string[] = Array.isArray((body as { tags?: unknown }).tags)
    ? ((body as { tags: string[] }).tags)
    : ['deals', 'products']

  const revalidated: string[] = []
  const failed: string[] = []

  for (const tag of tags) {
    try {
      revalidateTag(tag)
      revalidated.push(tag)
    } catch {
      failed.push(tag)
    }
  }

  return NextResponse.json({ revalidated, failed })
}
