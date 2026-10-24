import { db } from './prisma';

/**
 * The data dictionary lives in Postgres itself, as COMMENT ON TABLE / COLUMN:
 *   "Guest rating out of 5 | also called: rating, stars | values: A=active, C=closed"
 * and the business rules as COMMENT ON SCHEMA, one "- rule" per line.
 * The agents read it back from the catalog instead of from code.
 */
export interface DictEntry { desc?: string; synonyms?: string[]; values?: Record<string, string> }
interface SchemaDictionary {
  tables: Record<string, { desc?: string; synonyms?: string[]; columns: Record<string, { desc?: string; synonyms?: string[] }> }>;
  valueLabels: Record<string, Record<string, string>>;
  rules: string[];
}

export function decodeComment(s: string | null | undefined): DictEntry {
  if (!s) return {};
  const [desc, ...rest] = s.split(' | ');
  const out: DictEntry = { desc: desc.trim() || undefined };
  for (const part of rest) {
    const m = /^(also called|values):\s*(.*)$/i.exec(part.trim());
    if (!m) continue;
    const items = m[2].split(',').map((x) => x.trim()).filter(Boolean);
    if (m[1].toLowerCase() === 'also called') out.synonyms = items;
    else out.values = Object.fromEntries(items.map((x) => x.split('=').map((y) => y.trim())).filter((kv) => kv.length === 2 && kv[0] && kv[1]));
  }
  return out;
}

/** Inverse of decodeComment; '' means "no comment". Separators inside the parts are neutralised. */
export function encodeComment(e: DictEntry): string {
  const item = (s: string) => s.replace(/[|,=\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  const desc = (e.desc ?? '').replace(/\s*\|\s*/g, ' / ').replace(/\s+/g, ' ').trim();
  const synonyms = (e.synonyms ?? []).map(item).filter(Boolean);
  const values = Object.entries(e.values ?? {}).map(([k, v]) => [item(k), item(v)]).filter(([k, v]) => k && v);
  const parts = [
    synonyms.length ? `also called: ${synonyms.join(', ')}` : '',
    values.length ? `values: ${values.map(([k, v]) => `${k}=${v}`).join(', ')}` : '',
  ].filter(Boolean);
  return parts.length ? [desc, ...parts].join(' | ') : desc;
}

const decodeRules = (s: string | null | undefined) =>
  (s ?? '').split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);

export const encodeRules = (rules: string[]) => rules.map((r) => `- ${r.replace(/\s+/g, ' ').trim()}`).join('\n');

const cache = new Map<string, { at: number; dict: SchemaDictionary }>();

export function forgetDictionary(schema: string) {
  cache.delete(schema);
}

export async function readDictionary(schema: string, maxAgeMs = 10_000): Promise<SchemaDictionary> {
  const hit = cache.get(schema);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.dict;
  const rows = await db().$queryRaw<{ t: string; tc: string | null; c: string | null; cc: string | null }[]>`
    SELECT cl.relname::text AS t, obj_description(cl.oid, 'pg_class') AS tc, a.attname::text AS c, col_description(cl.oid, a.attnum) AS cc
    FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = ${schema} AND cl.relkind IN ('r', 'v', 'm')
    ORDER BY cl.relname, a.attnum`;
  const [ns] = await db().$queryRaw<{ sc: string | null }[]>`
    SELECT obj_description(oid, 'pg_namespace') AS sc FROM pg_namespace WHERE nspname = ${schema}`;
  const dict: SchemaDictionary = { tables: {}, valueLabels: {}, rules: decodeRules(ns?.sc) };
  for (const r of rows) {
    if (!dict.tables[r.t]) {
      const te = decodeComment(r.tc);
      dict.tables[r.t] = { desc: te.desc, synonyms: te.synonyms, columns: {} };
    }
    if (!r.c) continue;
    const ce = decodeComment(r.cc);
    dict.tables[r.t].columns[r.c] = { desc: ce.desc, synonyms: ce.synonyms };
    if (ce.values) dict.valueLabels[`${r.t}.${r.c}`] = ce.values;
  }
  cache.set(schema, { at: Date.now(), dict });
  return dict;
}
