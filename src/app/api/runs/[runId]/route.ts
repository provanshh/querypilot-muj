import { runEvents } from '@/server/agent/persist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Full event log of one mission — the replay source. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^run_[a-z0-9]+$/.test(runId)) return Response.json({ error: 'bad run id' }, { status: 400 });
  try {
    const out = await runEvents(runId);
    if (!out.run) return Response.json({ error: 'run not found' }, { status: 404 });
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
