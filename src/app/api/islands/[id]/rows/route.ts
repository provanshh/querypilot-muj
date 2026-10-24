import { gameDataset } from '@/server/game/islands';
import { introspect } from '@/server/agent/sqlTools';
import { withReadOnly } from '@/server/db/pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MISSING = new Set(['n/a', 'na', '-', '', 'null', 'none', '?', 'unknown']);

/** Why a single stored value would trip a naive query (for highlighting in the house card). */
function flag(v: unknown): string | null {
  if (v === null) return 'NULL — not reported';
  if (typeof v !== 'string') return null;
  if (MISSING.has(v.trim().toLowerCase())) return `placeholder '${v}' means missing`;
  if (v !== v.trim()) return 'stray whitespace';
  if (/^\d{1,3}(,\d{3})+$/.test(v)) return 'thousands separator';
  if (/^\d+(\.\d+)?%$/.test(v)) return "stored as '78%'";
  if (/^0?\.\d+$/.test(v)) return "stored as a fraction '0.78'";
  if (/^\d{4}\/\d{2}$/.test(v)) return "year written as '2023/24'";
  if (/^[₹$€£]\s?\d/.test(v)) return 'currency symbol stored in the number';
  if (/^\d+(\.\d+)?\s?k$/i.test(v)) return "'k' shorthand for thousands";
  if (/^\d+(\.\d+)?\/5$/.test(v)) return "rating written as '4.5/5'";
  if (/^\d{8}$/.test(v) || /^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v)) return 'date in a non-standard format';
  return null;
}

/** A small page of real rows from one table — what you see when you click a house. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const def = await gameDataset(id).catch(() => null);
  if (!def) return Response.json({ error: 'That dataset no longer exists.' }, { status: 404 });
  const isl = { id, schema: def.messySchema, name: def.name, rules: def.rules, tables: def.tables };
  const url = new URL(req.url);
  const tableName = url.searchParams.get('table') ?? '';
  const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get('offset') ?? 0) || 0));
  const limit = Math.max(1, Math.min(12, Number(url.searchParams.get('limit') ?? 6) || 6));
  const onlyFlagged = url.searchParams.get('flagged') === '1';
  try {
    const schema = await introspect(isl);
    const table = schema.tables.find((t) => t.name === tableName);
    if (!table) return Response.json({ error: 'unknown table' }, { status: 404 });
    const cols = table.columns.map((c) => c.name);
    const flagRow = (r: unknown[]) => r.map((v) => (v instanceof Date ? null : flag(v)));
    let rows: unknown[][];
    let matching = table.rowCount;
    if (onlyFlagged) {
      const all = await withReadOnly(isl.schema, (q) => q.arrays(`SELECT ${cols.join(', ')} FROM ${table.name} ORDER BY 1 LIMIT 2000`));
      const hits = all.rows.filter((r) => flagRow(r).some(Boolean));
      matching = hits.length;
      rows = hits.slice(offset, offset + limit);
    } else {
      rows = (await withReadOnly(isl.schema, (q) =>
        q.arrays(`SELECT ${cols.join(', ')} FROM ${table.name} ORDER BY 1 OFFSET $1 LIMIT $2`, [offset, limit]))).rows;
    }
    return Response.json({
      island: isl.id,
      table: table.name,
      description: table.description,
      rowCount: table.rowCount,
      matching,
      offset,
      columns: table.columns.map((c) => ({ name: c.name, type: c.type, description: c.description })),
      rows: rows.map((r) => r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))),
      flags: rows.map(flagRow),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
