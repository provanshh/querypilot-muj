import { broadcast, uiPayload } from '@/server/live';
import { ensureBot } from '@/server/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = /^ui\.(game\.(open|ready|start|island|level|dispatch|close))$/;

/** UI activity that is not an agent run (e.g. the game loading) shared over the live channel. */
export async function POST(req: Request) {
  ensureBot();
  const body = (await req.json().catch(() => ({}))) as { type?: string; summary?: string; island?: string };
  if (!body.type || !ALLOWED.test(body.type) || !body.summary) return Response.json({ error: 'bad event' }, { status: 400 });
  const p = uiPayload(body.type, String(body.summary).slice(0, 200), { island: body.island?.slice(0, 20), source: 'game' });
  await broadcast(p);
  return Response.json({ ok: true });
}
