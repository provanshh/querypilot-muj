import { crewStatus, ensureWorkers } from '@/server/agent/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The master/worker crew: live worker processes and the task queue of the last 24 hours. */
export async function GET() {
  try {
    await ensureWorkers();
    return Response.json(await crewStatus());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
