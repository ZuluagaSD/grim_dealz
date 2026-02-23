import { PrismaClient } from '@prisma/client'

// Singleton pattern — prevents too many connections in Next.js serverless/hot-reload
// The pooled DATABASE_URL (via Supavisor) is used here; DIRECT_URL is for migrations only
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
