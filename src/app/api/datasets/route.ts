import { listDatasets } from '@/server/datasets/registry';
import { safeSummary } from '@/server/engine/summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const datasets = await Promise.all((await listDatasets()).map(safeSummary));
    return Response.json({ datasets });
  } catch (err) {
    return Response.json({ error: `Database unavailable: ${err instanceof Error ? err.message : String(err)}` }, { status: 503 });
  }
}
