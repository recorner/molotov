import Prisma, * as PrismaScope from '@prisma/client';

const PrismaClient = Prisma?.PrismaClient || PrismaScope?.PrismaClient;

// Reuse a single PrismaClient across invocations (serverless / HMR) to avoid
// exhausting the database connection pool.
const globalForPrisma = globalThis as unknown as { __prisma?: any };

const prisma = globalForPrisma.__prisma ?? new PrismaClient();
if (!globalForPrisma.__prisma) globalForPrisma.__prisma = prisma;

export default prisma;
