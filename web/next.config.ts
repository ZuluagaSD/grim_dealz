import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
}

export default nextConfig
