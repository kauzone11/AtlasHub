// ─── Atlas Hub — Prisma Client ────────────────────────────────
// Singleton do Prisma Client para Next.js (evita múltiplas instâncias no hot reload)

// ─── Atlas Hub · singleton para o runtime Next.js ─────────────

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
