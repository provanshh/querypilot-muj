import { botStatus, ensureBot } from '@/server/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Telegram bridge status (never includes the token). Also makes sure the poller is running. */
export async function GET() {
  ensureBot();
  return Response.json(botStatus());
}
