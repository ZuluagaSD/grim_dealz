import { NextResponse, type NextRequest } from 'next/server'

/**
 * Redirect www → non-www to consolidate link equity and avoid
 * duplicate-URL issues in Google Search Console.
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
  // Run on all paths except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|site.webmanifest).*)'],
}
