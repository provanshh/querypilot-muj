import { listRuns } from '@/server/agent/persist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mission history, newest first, straight from Neon. */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 30);
  try {
    return Response.json({ runs: await listRuns(Number.isFinite(limit) ? limit : 30) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
