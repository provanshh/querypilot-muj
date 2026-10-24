import { launchMission, LaunchError, type LaunchOptions } from '@/server/agent/launch';
import type { QuestEvent } from '@/lib/quest/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as LaunchOptions;
  const encoder = new TextEncoder();
  let push: ((e: QuestEvent) => void) | null = null;
  const buffered: QuestEvent[] = [];

  let launched;
  try {
    launched = await launchMission(body, (e) => (push ? push(e) : buffered.push(e)));
  } catch (err) {
    const status = err instanceof LaunchError ? err.status : 500;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
  const { run, done } = launched;

  const stream = new ReadableStream({
    start(controller) {
      const write = (e: QuestEvent) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`)); } catch { /* client gone; mission keeps recording */ }
      };
      buffered.splice(0).forEach(write);
      push = write;
      void done.finally(() => {
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      run.abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Run-Id': run.id,
    },
  });
}
