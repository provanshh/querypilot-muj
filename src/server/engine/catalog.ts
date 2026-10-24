import { withReadOnly } from '@/server/db/pg';
import type { DatasetDef } from '@/server/datasets/registry';

export interface CatColumn {
  name: string;
  type: string;
  pk: boolean;
  fk?: { table: string; column: string };
  desc?: string;
  synonyms?: string[];
}
export interface CatTable { name: string; rows: number; desc?: string; synonyms?: string[]; columns: CatColumn[] }
export interface CatRel { fromTable: string; fromColumn: string; toTable: string; toColumn: string }
export interface Catalog { schema: string; tables: CatTable[]; relationships: CatRel[] }

export const qi = (name: string) => `"${name.replace(/"/g, '""')}"`;

const cache = new Map<string, { at: number; cat: Catalog }>();

/** Live Postgres catalog of one schema, annotated with the dataset's data dictionary. */
export async function catalog(schema: string, def?: DatasetDef, maxAgeMs = 10_000): Promise<Catalog> {
  const hit = cache.get(schema);
  if (hit && Date.now() - hit.at < maxAgeMs) return annotate(hit.cat, def);
  const cat = await withReadOnly(schema, async (q) => {
    const cols = await q<{ table_name: string; column_name: string; data_type: string; pk: boolean; ref_table: string | null; ref_column: string | null }>(
      `SELECT c.table_name, c.column_name, c.data_type,
              EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                      JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                      WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name) AS pk,
              fk.ref_table, fk.ref_column
       FROM information_schema.columns c
       LEFT JOIN LATERAL (
         SELECT ccu.table_name AS ref_table, ccu.column_name AS ref_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         WHERE tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND tc.constraint_type = 'FOREIGN KEY' AND k.column_name = c.column_name
         LIMIT 1) fk ON true
       WHERE c.table_schema = $1
       ORDER BY c.table_name, c.ordinal_position`,
      [schema],
    );
    const byTable = new Map<string, typeof cols>();
    cols.forEach((c) => byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c]));
    const tables: CatTable[] = [];
    const relationships: CatRel[] = [];
    for (const [name, tcols] of byTable) {
      const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${qi(name)}`);
      tables.push({
        name, rows: n,
        columns: tcols.map((c) => ({ name: c.column_name, type: c.data_type, pk: c.pk, fk: c.ref_table ? { table: c.ref_table, column: c.ref_column! } : undefined })),
      });
      tcols.filter((c) => c.ref_table).forEach((c) => relationships.push({ fromTable: name, fromColumn: c.column_name, toTable: c.ref_table!, toColumn: c.ref_column! }));
    }
    return { schema, tables, relationships };
  });
  cache.set(schema, { at: Date.now(), cat });
  return annotate(cat, def);
}

function annotate(cat: Catalog, def?: DatasetDef): Catalog {
  if (!def) return cat;
  return {
    ...cat,
    tables: cat.tables.map((t) => {
      const m = def.tables[t.name];
      return {
        ...t, desc: m?.desc, synonyms: m?.synonyms,
        columns: t.columns.map((c) => ({ ...c, desc: m?.columns[c.name]?.desc, synonyms: m?.columns[c.name]?.synonyms })),
      };
    }),
  };
}
