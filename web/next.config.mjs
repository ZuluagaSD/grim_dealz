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
}

export default nextConfig
