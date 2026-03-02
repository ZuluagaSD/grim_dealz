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
      {
        protocol: 'https',
        hostname: 'www.games-workshop.com',
      },
      {
        protocol: 'https',
        hostname: '**.games-workshop.com',
      },
    ],
  },
}

export default nextConfig
