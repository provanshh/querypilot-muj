import { pool } from '@/server/db/pg';
import { encodeComment, encodeRules, forgetDictionary, type DictEntry } from '@/server/db/comments';
import { analyzeDataset, forgetAnalysis } from '@/server/engine/analyze';
import { qi } from '@/server/engine/catalog';
import { getDataset, type DatasetDef } from './registry';

/**
 * Knowledge the data cannot carry by itself: what columns mean, what codes stand for, and the
 * owner's business rules. It is written by the user and stored as Postgres COMMENTs on the
 * dataset's own schema, where the agents' schema brief reads it.
 */

export const DICT_LIMITS = { desc: 300, synonyms: 10, synonym: 40, codes: 30, code: 60, rules: 20, rule: 300 };

interface ColumnKnowledge extends DictEntry { name: string; role: string; cleanType: string; sample: string[] }
interface TableKnowledge { name: string; rows: number; desc?: string; synonyms?: string[]; columns: ColumnKnowledge[] }
export interface DictionaryView { datasetId: string; rules: string[]; tables: TableKnowledge[] }

export interface DictionaryInput {
  rules?: string[];
  tables?: Record<string, { desc?: string; synonyms?: string[]; columns?: Record<string, DictEntry> }>;
}

export async function dictionaryView(def: DatasetDef): Promise<DictionaryView> {
  const a = await analyzeDataset(def);
  return {
    datasetId: def.id,
    rules: def.rules,
    tables: a.tables.map((t) => {
      const meta = def.tables[t.name];
      return {
        name: t.name, rows: t.rows, desc: meta?.desc, synonyms: meta?.synonyms,
        columns: t.columns.filter((c) => c.name !== t.pk && c.role !== 'pk').map((c) => ({
          name: c.name, role: c.role, cleanType: c.cleanType,
          sample: c.top.map((v) => v.value).filter((v) => !v.startsWith('∅') && !v.startsWith("''")).slice(0, 6),
          desc: meta?.columns[c.name]?.desc, synonyms: meta?.columns[c.name]?.synonyms, values: def.valueLabels?.[`${t.name}.${c.name}`],
        })),
      };
    }),
  };
}

const lit = (s: string) => `'${s.replace(/\0/g, '').replace(/'/g, "''")}'`;
const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function cleanEntry(e: DictEntry | undefined): DictEntry {
  const synonyms = (Array.isArray(e?.synonyms) ? e.synonyms : []).map((s) => clean(s, DICT_LIMITS.synonym)).filter(Boolean).slice(0, DICT_LIMITS.synonyms);
  const values = Object.fromEntries(Object.entries(e?.values && typeof e.values === 'object' ? e.values : {})
    .map(([k, v]) => [clean(k, DICT_LIMITS.code), clean(v, DICT_LIMITS.code)])
    .filter(([k, v]) => k && v)
    .slice(0, DICT_LIMITS.codes));
  return { desc: clean(e?.desc, DICT_LIMITS.desc) || undefined, synonyms, values };
}

const cleanRules = (rules: unknown) =>
  (Array.isArray(rules) ? rules : []).map((r) => clean(r, DICT_LIMITS.rule)).filter(Boolean).slice(0, DICT_LIMITS.rules);

/**
 * Saves the dictionary and rules. Only tables and columns that exist in the dataset are written;
 * anything else in the input is rejected rather than silently stored.
 */
export async function saveDictionary(datasetId: string, input: DictionaryInput): Promise<DictionaryView> {
  const def = await getDataset(datasetId);
  if (!def) throw new Error('Unknown dataset.');
  const a = await analyzeDataset(def);
  const schema = def.messySchema;
  const statements: string[] = [];
  if (input.rules !== undefined) statements.push(`COMMENT ON SCHEMA ${qi(schema)} IS ${commentValue(encodeRules(cleanRules(input.rules)))}`);
  for (const [tname, t] of Object.entries(input.tables ?? {})) {
    const table = a.tables.find((x) => x.name === tname);
    if (!table) throw new Error(`Unknown table "${tname}".`);
    statements.push(`COMMENT ON TABLE ${qi(schema)}.${qi(tname)} IS ${commentValue(encodeComment(cleanEntry({ desc: t.desc, synonyms: t.synonyms })))}`);
    for (const [cname, c] of Object.entries(t.columns ?? {})) {
      if (!table.columns.some((x) => x.name === cname)) throw new Error(`Unknown column "${tname}.${cname}".`);
      statements.push(`COMMENT ON COLUMN ${qi(schema)}.${qi(tname)}.${qi(cname)} IS ${commentValue(encodeComment(cleanEntry(c)))}`);
    }
  }
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    for (const s of statements) await client.query(s);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  forgetDictionary(schema);
  forgetAnalysis(def.id);
  const fresh = await getDataset(def.id);
  return dictionaryView(fresh!);
}

function commentValue(s: string) {
  return s ? lit(s) : 'NULL';
}

/** Adds or removes one business rule (used by the Telegram bot). */
export async function editRules(datasetId: string, edit: { add?: string; removeIndex?: number }): Promise<string[]> {
  const def = await getDataset(datasetId);
  if (!def) throw new Error('Unknown dataset.');
  const rules = [...def.rules];
  if (edit.add) {
    if (rules.length >= DICT_LIMITS.rules) throw new Error(`At most ${DICT_LIMITS.rules} rules per dataset.`);
    rules.push(edit.add);
  }
  if (edit.removeIndex !== undefined) {
    if (!rules[edit.removeIndex]) throw new Error('There is no rule with that number.');
    rules.splice(edit.removeIndex, 1);
  }
  return (await saveDictionary(datasetId, { rules })).rules;
}
