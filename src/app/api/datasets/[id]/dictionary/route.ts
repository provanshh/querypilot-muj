import { getDataset } from '@/server/datasets/registry';
import { dictionaryView, saveDictionary, type DictionaryInput } from '@/server/datasets/dictionary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (err: unknown, status = 500) => Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = await getDataset(id);
  if (!def) return Response.json({ error: 'unknown dataset' }, { status: 404 });
  try {
    return Response.json(await dictionaryView(def));
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getDataset(id))) return Response.json({ error: 'unknown dataset' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as DictionaryInput | null;
  if (!body || typeof body !== 'object') return fail(new Error('Expected a JSON body.'), 400);
  try {
    return Response.json(await saveDictionary(id, body));
  } catch (err) {
    return fail(err, /^Unknown /.test(err instanceof Error ? err.message : '') ? 400 : 500);
  }
}
