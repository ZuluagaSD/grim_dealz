import { ImageResponse } from 'next/og'
import { getProduct } from '@/lib/data'

export const runtime = 'edge'
export const revalidate = 14400 // 4h, matches product page ISR
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

// Fetch and convert the font at build/edge time
async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  return res.arrayBuffer()
}

// Google Fonts CSS → extract woff2 URL
async function getGoogleFontUrl(family: string, weight: number): Promise<string> {
  const res = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }
  )
  const css = await res.text()
  const match = css.match(/src: url\(([^)]+)\) format\('woff2'\)/)
  return match?.[1] ?? ''
}

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const product = await getProduct(params.slug)
  if (!product) {
    return new Response('Not found', { status: 404 })
  }

  const usdListings = product.listings.filter(
    (l) => (l.store?.currency ?? l.currency ?? 'USD') === 'USD'
  )
  const cheapest = usdListings[0]
  const gwRrp = Number(product.gwRrpUsd)
  const cheapestPrice = cheapest ? Number(cheapest.currentPrice) : null
  const savings = cheapestPrice ? gwRrp - cheapestPrice : 0
  const discountPct = cheapestPrice ? Math.round((savings / gwRrp) * 100) : 0
  const storeName = cheapest?.store?.name ?? null
  const storeCount = usdListings.length

  // Load fonts
  const [cinzelData, interData] = await Promise.all([
    getGoogleFontUrl('Cinzel', 700).then(loadFont),
    getGoogleFontUrl('Inter', 600).then(loadFont),
  ])

  // Proxy product image through our edge function (GW CDN blocks social crawlers)
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

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0c0c0c',
          padding: '0',
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
                width: 340,
                height: 340,
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
          {/* Game system / faction tag */}
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: '#c9a84c',
              fontFamily: 'Inter',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              opacity: 0.8,
            }}
          >
            {[product.faction, product.gameSystem].filter(Boolean).join(' · ')}
          </div>

          {/* Product name */}
          <div
            style={{
              display: 'flex',
              fontSize: product.name.length > 40 ? 36 : 44,
              fontFamily: 'Cinzel',
              fontWeight: 700,
              color: '#e8e0d0',
              lineHeight: 1.15,
              maxHeight: '160px',
              overflow: 'hidden',
            }}
          >
            {product.name}
          </div>

          {/* Price row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
              marginTop: '8px',
            }}
          >
            {cheapestPrice ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 56,
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    color: '#e8e0d0',
                  }}
                >
                  ${cheapestPrice.toFixed(2)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 28,
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    color: '#5a5248',
                    textDecoration: 'line-through',
                  }}
                >
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
              <div
                style={{
                  display: 'flex',
                  fontSize: 40,
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  color: '#a09880',
                }}
              >
                RRP ${gwRrp.toFixed(2)}
              </div>
            )}
          </div>

          {/* Store info */}
          {storeName && (
            <div
              style={{
                display: 'flex',
                fontSize: 20,
                fontFamily: 'Inter',
                fontWeight: 600,
                color: '#a09880',
              }}
            >
              {storeName}
              {storeCount > 1 ? ` + ${storeCount - 1} more` : ''}
              {' · Prices compared every 4h'}
            </div>
          )}

          {/* GrimDealz branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: 'auto',
              paddingTop: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                fontFamily: 'Cinzel',
                fontWeight: 700,
                color: '#c9a84c',
                letterSpacing: '3px',
              }}
            >
              ⚔ GRIMDEALZ
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontFamily: 'Inter',
                fontWeight: 600,
                color: '#5a5248',
                marginLeft: '8px',
              }}
            >
              grimdealz.com
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Cinzel', data: cinzelData, weight: 700, style: 'normal' },
        { name: 'Inter', data: interData, weight: 600, style: 'normal' },
      ],
    }
  )
}
