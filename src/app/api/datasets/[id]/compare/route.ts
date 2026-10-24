import { getDataset } from '@/server/datasets/registry';
import { analyzeDataset } from '@/server/engine/analyze';
import { compareTable } from '@/server/engine/compare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Old vs new: every raw cell next to its cleaned value, rows the dedupe drops, and category distributions before/after. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = await getDataset(id);
  if (!def) return Response.json({ error: 'unknown dataset' }, { status: 404 });
  const url = new URL(req.url);
  const f = url.searchParams.get('filter');
  const filter = f === 'dropped' || f === 'all' ? f : 'changed';
  try {
    const a = await analyzeDataset(def);
    const table = url.searchParams.get('table') ?? [...a.tables].sort((x, y) => y.rows - x.rows)[0]?.name;
    if (!a.tables.some((t) => t.name === table)) return Response.json({ error: 'unknown table' }, { status: 404 });
    return Response.json(await compareTable(a, table!, filter, Math.min(100, Number(url.searchParams.get('limit')) || 40), {
      offset: Number(url.searchParams.get('offset')) || 0,
      search: url.searchParams.get('q')?.slice(0, 80) ?? undefined,
    }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
