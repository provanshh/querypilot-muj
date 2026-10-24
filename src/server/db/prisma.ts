import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { pool } from './pg';

const g = globalThis as unknown as { __qpPrisma?: PrismaClient };

/** The app's bookkeeping (qp_meta) goes through Prisma; it shares the pg pool with the agents. */
export function db(): PrismaClient {
  g.__qpPrisma ??= new PrismaClient({ adapter: new PrismaPg(pool()) });
  return g.__qpPrisma;
}

/** Fans a live-feed payload out to every server process listening on qp_live. */
export async function notify(channel: string, payload: unknown): Promise<void> {
  await db().$executeRaw`SELECT pg_notify(${channel}, ${JSON.stringify(payload)})`;
}
