/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
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
        source: '/go/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
