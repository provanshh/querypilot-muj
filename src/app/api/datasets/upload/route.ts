import { getDataset } from '@/server/datasets/registry';
import { safeSummary } from '@/server/engine/summary';
import { storeUpload, UPLOAD_LIMITS } from '@/server/engine/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Accepts a CSV as multipart `file` or JSON `{ name, csv }` and stores it as its own read-only dataset. */
export async function POST(req: Request) {
  let name = 'pasted.csv';
  let csv = '';
  try {
    const type = req.headers.get('content-type') ?? '';
    if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return Response.json({ error: 'Attach a CSV file as "file".' }, { status: 400 });
      if (file.size > UPLOAD_LIMITS.bytes) return Response.json({ error: 'File is larger than 2 MB.' }, { status: 413 });
      name = file.name || name;
      csv = await file.text();
    } else {
      const body = (await req.json()) as { name?: string; csv?: string };
      name = body.name?.trim() || name;
      csv = body.csv ?? '';
    }
  } catch {
    return Response.json({ error: 'Could not read the upload.' }, { status: 400 });
  }
  if (!csv.trim()) return Response.json({ error: 'The file is empty.' }, { status: 400 });
  try {
    const stored = await storeUpload(name, csv);
    const def = await getDataset(stored.id);
    return Response.json({ ...stored, summary: def ? await safeSummary(def) : null });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
