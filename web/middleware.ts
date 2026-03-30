import { NextResponse, type NextRequest } from 'next/server'

/**
 * Redirect www → non-www to consolidate link equity and avoid
 * duplicate-URL issues in Google Search Console.
 *
 * Runs on ALL paths (including static assets) so that
 * www.grimdealz.com/_next/static/... also redirects.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''

  if (host.startsWith('www.')) {
    const canonical = new URL(request.url)
    canonical.host = host.replace(/^www\./, '')
    return NextResponse.redirect(canonical, 301)
  }

  return NextResponse.next()
}

export const config = {
  // Match all paths — www redirect must apply to static assets too
  matcher: ['/(.*)',],
}
