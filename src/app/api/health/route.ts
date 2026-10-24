import { db as prisma } from '@/server/db/prisma';
import { liveConnected } from '@/server/live';
import { getLlmStatus } from '@/server/agent/llm';
import { botStatus, ensureBot } from '@/server/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  ensureBot();
  const t = Date.now();
  let db: { ok: boolean; latencyMs?: number; error?: string };
  try {
    await prisma().$queryRaw`SELECT 1`;
    db = { ok: true, latencyMs: Date.now() - t };
  } catch {
    db = { ok: false, error: 'The data store is unavailable right now.' };
  }
  const llm = await getLlmStatus();
  return Response.json({ db, live: liveConnected(), agents: { available: llm.available, reason: llm.reason }, telegram: botStatus() });
}
