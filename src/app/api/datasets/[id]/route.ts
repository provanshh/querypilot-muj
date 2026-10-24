import { getDataset } from '@/server/datasets/registry';
import { datasetDetail } from '@/server/engine/summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = await getDataset(id);
  if (!def) return Response.json({ error: 'unknown dataset' }, { status: 404 });
  const verify = new URL(req.url).searchParams.get('verify') === '1';
  try {
    return Response.json(await datasetDetail(def, verify));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
