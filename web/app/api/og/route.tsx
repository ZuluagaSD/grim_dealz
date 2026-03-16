/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const SIZE = { width: 1200, height: 630 }

async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  return res.arrayBuffer()
}

async function getGoogleFontUrl(family: string, weight: number): Promise<string> {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }
    )
  ).text()
  const match = css.match(/src: url\(([^)]+)\) format\('woff2'\)/)
  return match?.[1] ?? ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNum(v: any): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v)
  if (v !== null && typeof v?.toNumber === 'function') return v.toNumber() as number
  return Number(v)
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return new Response('Missing slug', { status: 400 })

  const product = await prisma.product.findUnique({
    where: { slug, isActive: true },
    include: {
      listings: {
        where: { store: { isActive: true }, currency: 'USD' },
        include: { store: true },
        orderBy: [{ inStock: 'desc' }, { currentPrice: 'asc' }],
        take: 5,
      },
    },
  })

  if (!product) return new Response('Not found', { status: 404 })

  const cheapest = product.listings[0]
  const gwRrp = toNum(product.gwRrpUsd)
  const cheapestPrice = cheapest ? toNum(cheapest.currentPrice) : null
  const savings = cheapestPrice ? gwRrp - cheapestPrice : 0
  const discountPct = cheapestPrice && gwRrp > 0 ? Math.round((savings / gwRrp) * 100) : 0
  const storeName = cheapest?.store?.name ?? null
  const storeCount = product.listings.length
  const factionGame = [product.faction, product.gameSystem].filter(Boolean).join(' · ')

  const [cinzelData, interData] = await Promise.all([
    getGoogleFontUrl('Cinzel', 700).then(loadFont),
    getGoogleFontUrl('Inter', 600).then(loadFont),
  ])

  // Proxy product image (GW CDN blocks social crawlers)
  let productImageSrc: string | null = null
  if (product.imageUrl) {
    try {
      const imgRes = await fetch(product.imageUrl)
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer()
        const base64 = Buffer.from(buf).toString('base64')
        const ct = imgRes.headers.get('content-type') ?? 'image/png'
        productImageSrc = `data:${ct};base64,${base64}`
      }
    } catch {
      // Fall back to no image
    }
  }

  const resp = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0c0c0c',
        }}
      >
        {/* Left: Product image */}
        <div
          style={{
            width: '420px',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#141414',
            borderRight: '2px solid #2a2a2a',
            flexShrink: 0,
          }}
        >
          {productImageSrc ? (
            <img
              src={productImageSrc}
              width={340}
              height={340}
              style={{ objectFit: 'contain' }}
            />
          ) : (
            <div
              style={{
                width: '340px',
                height: '340px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#5a5248',
                fontSize: 80,
              }}
            >
              ⚔
            </div>
          )}
        </div>

        {/* Right: Product info */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '48px 52px',
            gap: '20px',
          }}
        >
          {factionGame && (
            <div
              style={{
                display: 'flex',
                fontSize: 20,
                color: '#c9a84c',
                fontFamily: 'Inter',
                fontWeight: 600,
                letterSpacing: '2px',
              }}
            >
              {factionGame.toUpperCase()}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              fontSize: product.name.length > 40 ? 36 : 44,
              fontFamily: 'Cinzel',
              fontWeight: 700,
              color: '#e8e0d0',
              lineHeight: 1.15,
            }}
          >
            {product.name.length > 60 ? product.name.slice(0, 57) + '...' : product.name}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginTop: '8px',
            }}
          >
            {cheapestPrice ? (
              <>
                <div style={{ display: 'flex', fontSize: 56, fontFamily: 'Inter', fontWeight: 600, color: '#e8e0d0' }}>
                  ${cheapestPrice.toFixed(2)}
                </div>
                <div style={{ display: 'flex', fontSize: 28, fontFamily: 'Inter', fontWeight: 600, color: '#5a5248', textDecoration: 'line-through' }}>
                  ${gwRrp.toFixed(2)}
                </div>
                {discountPct > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                      color: '#4ade80',
                      fontSize: 24,
                      fontFamily: 'Inter',
                      fontWeight: 600,
                      padding: '6px 14px',
                      borderRadius: '8px',
                    }}
                  >
                    {discountPct}% OFF
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', fontSize: 40, fontFamily: 'Inter', fontWeight: 600, color: '#a09880' }}>
                RRP ${gwRrp.toFixed(2)}
              </div>
            )}
          </div>

          {storeName && (
            <div style={{ display: 'flex', fontSize: 20, fontFamily: 'Inter', fontWeight: 600, color: '#a09880' }}>
              {storeName}{storeCount > 1 ? ` + ${storeCount - 1} more` : ''} · Prices compared every 4h
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: 'auto',
              paddingTop: '16px',
            }}
          >
            <div style={{ display: 'flex', fontSize: 26, fontFamily: 'Cinzel', fontWeight: 700, color: '#c9a84c', letterSpacing: '3px' }}>
              ⚔ GRIMDEALZ
            </div>
            <div style={{ display: 'flex', fontSize: 18, fontFamily: 'Inter', fontWeight: 600, color: '#5a5248', marginLeft: '8px' }}>
              grimdealz.com
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: 'Cinzel', data: cinzelData, weight: 700 as const, style: 'normal' as const },
        { name: 'Inter', data: interData, weight: 600 as const, style: 'normal' as const },
      ],
    }
  )

  // Cache for 4h
  resp.headers.set('Cache-Control', 'public, max-age=14400, s-maxage=14400, stale-while-revalidate=86400')
  return resp
}
