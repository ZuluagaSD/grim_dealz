import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock prisma before importing the route
vi.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findFirst: vi.fn(),
    },
    clickEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_UUID = '6ba7b810-9dad-41d4-a716-446655440000'

async function callRoute(store: string, id: string) {
  const { GET } = await import('./route')
  const req = new NextRequest(`http://localhost/go/${store}/${id}`)
  return GET(req, { params: { store, id } })
}

describe('GET /go/[store]/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns 302 to affiliate URL for valid listing', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.listing.findFirst).mockResolvedValue({
      id: VALID_UUID,
      affiliateUrl: 'https://www.miniaturemarket.com/aff/space-marines',
      storeProductUrl: 'https://www.miniaturemarket.com/space-marines',
    })

    const res = await callRoute('miniature-market', VALID_UUID)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'https://www.miniaturemarket.com/aff/space-marines'
    )
  })

  it('returns 302 to storeProductUrl when listing has no affiliate URL', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.listing.findFirst).mockResolvedValue({
      id: VALID_UUID,
      affiliateUrl: null,
      storeProductUrl: 'https://www.miniaturemarket.com/space-marines',
    })

    const res = await callRoute('miniature-market', VALID_UUID)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'https://www.miniaturemarket.com/space-marines'
    )
  })

  it('returns 302 to homepage when listing has no affiliate or store URL', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.listing.findFirst).mockResolvedValue({
      id: VALID_UUID,
      affiliateUrl: null,
      storeProductUrl: null,
    })

    const res = await callRoute('miniature-market', VALID_UUID)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('returns 400 for invalid UUID format', async () => {
    const res = await callRoute('miniature-market', 'not-a-uuid')

    expect(res.status).toBe(400)
  })

  it('returns 302 to homepage when listing does not match store slug', async () => {
    const { prisma } = await import('@/lib/prisma')
    // findFirst returns null when store slug does not match
    vi.mocked(prisma.listing.findFirst).mockResolvedValue(null)

    const res = await callRoute('wrong-store', VALID_UUID)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('sets Referrer-Policy: no-referrer header on redirect', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.listing.findFirst).mockResolvedValue({
      id: VALID_UUID,
      affiliateUrl: 'https://example.com/aff',
      storeProductUrl: null,
    })

    const res = await callRoute('some-store', VALID_UUID)

    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('sets Cache-Control: no-store header on redirect', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.listing.findFirst).mockResolvedValue({
      id: OTHER_UUID,
      affiliateUrl: 'https://example.com/aff',
      storeProductUrl: null,
    })

    const res = await callRoute('some-store', OTHER_UUID)

    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
