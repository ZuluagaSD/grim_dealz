/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const W = 1200
const H = 630

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNum(v: any): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v)
  if (v !== null && typeof v?.toNumber === 'function') return v.toNumber() as number
  return Number(v)
}

// Pre-fetched from Google Fonts — avoids runtime fetch issues
const INTER_FONT_URL = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf'
const CINZEL_FONT_URL = 'https://fonts.gstatic.com/s/cinzel/v23/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnTYrvDE5ZdqU.ttf'

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug')
    if (!slug) return new Response('Missing slug', { status: 400 })

    const product = await prisma.product.findUnique({
      where: { slug, isActive: true },
      select: {
        name: true,
        faction: true,
        gameSystem: true,
        gwRrpUsd: true,
        imageUrl: true,
        listings: {
          where: { store: { isActive: true }, currency: 'USD' },
          select: {
            currentPrice: true,
            inStock: true,
            store: { select: { name: true } },
          },
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
    const name = product.name.length > 55 ? product.name.slice(0, 52) + '...' : product.name
    const nameSize = product.name.length > 40 ? 36 : 44

    // Load fonts
    const [cinzelData, interData] = await Promise.all([
      fetch(CINZEL_FONT_URL).then((r) => r.arrayBuffer()),
      fetch(INTER_FONT_URL).then((r) => r.arrayBuffer()),
    ])

    // Proxy product image (GW CDN blocks Twitter/social crawlers)
    let imgSrc: string | null = null
    if (product.imageUrl) {
      try {
        const imgRes = await fetch(product.imageUrl)
        if (imgRes.ok && imgRes.headers.get('content-length') !== '0') {
          const buf = await imgRes.arrayBuffer()
          if (buf.byteLength > 100) {
            const b64 = Buffer.from(buf).toString('base64')
            const ct = imgRes.headers.get('content-type') ?? 'image/png'
            imgSrc = `data:${ct};base64,${b64}`
          }
        }
      } catch {
        // No image, that's fine
      }
    }

    const resp = new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', backgroundColor: '#0c0c0c' }}>
          {/* Left panel: product image */}
          <div
            style={{
              width: '400px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#141414',
              borderRight: '2px solid #2a2a2a',
            }}
          >
            {imgSrc ? (
              <img src={imgSrc} width={320} height={320} style={{ objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'flex', color: '#5a5248', fontSize: 80 }}>⚔</div>
            )}
          </div>

          {/* Right panel: info */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '44px 48px',
              gap: '16px',
            }}
          >
            {/* Faction · Game */}
            {factionGame ? (
              <div style={{ display: 'flex', fontSize: 18, color: '#c9a84c', fontFamily: 'Inter', letterSpacing: '2px' }}>
                {factionGame.toUpperCase()}
              </div>
            ) : null}

            {/* Name */}
            <div style={{ display: 'flex', fontSize: nameSize, fontFamily: 'Cinzel', color: '#e8e0d0', lineHeight: 1.2 }}>
              {name}
            </div>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px' }}>
              {cheapestPrice ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: 52, fontFamily: 'Inter', color: '#e8e0d0' }}>
                    ${cheapestPrice.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 26, fontFamily: 'Inter', color: '#5a5248', textDecoration: 'line-through' }}>
                    ${gwRrp.toFixed(2)}
                  </span>
                  {discountPct > 0 ? (
                    <span
                      style={{
                        fontSize: 22,
                        fontFamily: 'Inter',
                        color: '#4ade80',
                        backgroundColor: 'rgba(34,197,94,0.15)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                      }}
                    >
                      {discountPct}% OFF
                    </span>
                  ) : null}
                </div>
              ) : (
                <span style={{ fontSize: 36, fontFamily: 'Inter', color: '#a09880' }}>
                  RRP ${gwRrp.toFixed(2)}
                </span>
              )}
            </div>

            {/* Store */}
            {storeName ? (
              <div style={{ display: 'flex', fontSize: 18, fontFamily: 'Inter', color: '#a09880' }}>
                {storeName}{storeCount > 1 ? ` + ${storeCount - 1} more` : ''} · Updated every 4h
              </div>
            ) : null}

            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto', paddingTop: '12px' }}>
              <span style={{ fontSize: 24, fontFamily: 'Cinzel', color: '#c9a84c', letterSpacing: '2px' }}>
                ⚔ GRIMDEALZ
              </span>
              <span style={{ fontSize: 16, fontFamily: 'Inter', color: '#5a5248', marginLeft: '6px' }}>
                grimdealz.com
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: W,
        height: H,
        fonts: [
          { name: 'Cinzel', data: cinzelData, weight: 700 as const, style: 'normal' as const },
          { name: 'Inter', data: interData, weight: 600 as const, style: 'normal' as const },
        ],
      }
    )

    resp.headers.set('Cache-Control', 'public, s-maxage=14400, stale-while-revalidate=86400')
    return resp
  } catch (err) {
    console.error('OG image error:', err)
    // Fallback: redirect to static OG image
    return Response.redirect(new URL('/og-default.png', req.url), 302)
  }
}
