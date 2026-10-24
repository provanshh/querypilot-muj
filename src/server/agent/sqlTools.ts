import type { WorldSchema, WorldTable, WorldRelationship } from '@/lib/quest/types';
import { withReadOnly } from '@/server/db/pg';
import type { TableMeta } from '@/server/datasets/registry';

/** Anything with a schema to read: an installed dataset, described by its Postgres comments. */
interface SchemaSource { id: string; schema: string; name: string; rules: string[]; tables: Record<string, TableMeta> }

export const MAX_RESULT_ROWS = 200;

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

const schemaCache = new Map<string, { at: number; schema: WorldSchema }>();

/** Reads the live catalog of an island: tables, columns, keys, row counts and sample values. */
export async function introspect(isl: SchemaSource, maxAgeMs = 5000): Promise<WorldSchema> {
  const hit = schemaCache.get(isl.schema);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.schema;
  const schema = await withReadOnly(isl.schema, async (run) => {
    const cols = await run<{ table_name: string; column_name: string; data_type: string; pk: boolean; ref_table: string | null; ref_column: string | null }>(
      `SELECT c.table_name, c.column_name, c.data_type,
              EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name
              ) AS pk,
              fk.ref_table, fk.ref_column
       FROM information_schema.columns c
       LEFT JOIN LATERAL (
         SELECT ccu.table_name AS ref_table, ccu.column_name AS ref_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND tc.constraint_type = 'FOREIGN KEY' AND k.column_name = c.column_name
         LIMIT 1
       ) fk ON true
       WHERE c.table_schema = $1
       ORDER BY c.table_name, c.ordinal_position`,
      [isl.schema],
    );
    const byTable = new Map<string, typeof cols>();
    cols.forEach((c) => byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c]));

    const relationships: WorldRelationship[] = [];
    const tables: WorldTable[] = [];
    for (const [name, tcols] of byTable) {
      const sampleSql = `SELECT (SELECT COUNT(*) FROM ${q(name)}) AS __n, ${tcols
        .map((c) => `ARRAY(SELECT DISTINCT ${q(c.column_name)}::text FROM ${q(name)} WHERE ${q(c.column_name)} IS NOT NULL LIMIT 6) AS ${q(c.column_name)}`)
        .join(', ')}`;
      const [row] = await run(sampleSql);
      const dict = isl.tables[name];
      tcols.forEach((c) => {
        if (c.ref_table) {
          relationships.push({ id: `${name}.${c.column_name}->${c.ref_table}.${c.ref_column}`, fromTable: name, fromColumn: c.column_name, toTable: c.ref_table, toColumn: c.ref_column! });
        }
      });
      tables.push({
        name,
        description: dict?.desc,
        rowCount: Number(row.__n),
        columns: tcols.map((c) => ({
          name: c.column_name,
          type: c.data_type.toUpperCase(),
          pk: c.pk,
          fk: c.ref_table ? { table: c.ref_table, column: c.ref_column! } : undefined,
          description: dict?.columns[c.column_name]?.desc,
          samples: ((row[c.column_name] as string[] | null) ?? []).map(String),
        })),
      });
    }
    return { id: isl.id, name: isl.name, tables, relationships, rules: isl.rules };
  });
  schemaCache.set(isl.schema, { at: Date.now(), schema });
  return schema;
}

/* ------------------------------------------------------------------------- */
/* Guarded execution                                                          */
/* ------------------------------------------------------------------------- */

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|do|vacuum|reindex|analyze|cluster|listen|notify|lock|set|reset|begin|commit|rollback|savepoint|release|prepare|execute|deallocate|refresh|security|dblink\w*|lo_\w+)\b|\bpg_\w+\s*\(|\bqp_meta\b|\binto\s+\w/i;

export function checkSqlSafety(sql: string): { ok: true; cleaned: string } | { ok: false; reason: string } {
  let s = sql.trim().replace(/^```(?:sql)?/i, '').replace(/```$/, '').trim();
  s = s.replace(/;\s*$/, '');
  const withoutStrings = s.replace(/'([^']|'')*'/g, "''").replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (withoutStrings.includes(';')) return { ok: false, reason: 'Multiple statements are not allowed.' };
  if (!/^\s*(select|with)\b/i.test(withoutStrings)) return { ok: false, reason: 'Only SELECT / WITH queries are allowed.' };
  const m = withoutStrings.match(FORBIDDEN);
  if (m) return { ok: false, reason: `"${m[0].trim().toUpperCase()}" is not allowed in read-only mode.` };
  return { ok: true, cleaned: s };
}

export interface ExecResult {
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}
