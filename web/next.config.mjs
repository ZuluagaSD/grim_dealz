/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.warhammer.com',
      },
      {
        protocol: 'https',
        hostname: '**.warhammer.com',
      },
    ],
  },
  async headers() {
    return [
      {
        // Prevent search engines from indexing affiliate redirect pages
        source: '/go/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // Prevent search engines from indexing API routes
        source: '/api/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
