import { subscribe, liveConnected } from '@/server/live';
import { ensureBot } from '@/server/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Server-Sent Events: every mission event from every player, pushed by Postgres NOTIFY. */
export async function GET(req: Request) {
  ensureBot();
  const encoder = new TextEncoder();
  let unsub: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };
      unsub = await subscribe((p) => write('mission', p));
      write('hello', { live: liveConnected(), at: new Date().toISOString() });
      ping = setInterval(() => write('ping', { live: liveConnected() }), 20_000);
      req.signal.addEventListener('abort', () => {
        unsub?.();
        clearInterval(ping);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      unsub?.();
      clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
