import type { DatasetDef } from '@/server/datasets/registry';
import { analyzeDataset, verifyCleaning, type Analysis } from './analyze';

export interface DatasetSummary {
  id: string;
  name: string;
  createdAt?: string;
  tables: { name: string; rows: number; columns: number; desc?: string }[];
  rows: number;
  score: number;
  grade: string;
  issues: { high: number; medium: number; low: number; info: number };
  duplicates: number;
  /** Starter questions built from this dataset's own columns. */
  questions: { id: string; question: string }[];
  error?: string;
}

function summarize(def: DatasetDef, a: Analysis): DatasetSummary {
  const sev = (s: string) => a.issues.filter((i) => i.severity === s).length;
  return {
    id: def.id, name: def.name, createdAt: def.createdAt,
    tables: a.tables.map((t) => ({ name: t.name, rows: t.rows, columns: t.columns.length, desc: t.desc })),
    rows: a.tables.reduce((s, t) => s + t.rows, 0),
    score: a.score, grade: a.grade,
    issues: { high: sev('high'), medium: sev('medium'), low: sev('low'), info: sev('info') },
    duplicates: a.tables.reduce((s, t) => s + (t.dedupe?.removed ?? 0), 0),
    questions: suggestQuestions(a),
  };
}

/** Starter questions built from the column roles the Inspector inferred. */
function suggestQuestions(a: Analysis): DatasetSummary['questions'] {
  const t = [...a.tables].sort((x, y) => y.rows - x.rows)[0];
  if (!t) return [];
  const words = (n: string) => n.replace(/_/g, ' ');
  const measures = t.columns.filter((c) => c.role === 'measure');
  const cats = t.columns.filter((c) => c.role === 'category');
  const date = t.columns.find((c) => c.role === 'date');
  const out: DatasetSummary['questions'] = [];
  const m = measures.find((c) => /amount|revenue|sales|total|value/.test(c.name)) ?? measures[0];
  if (m && cats[0]) out.push({ id: 'total', question: `What is the total ${words(m.name)} by ${words(cats[0].name)}?` });
  if (cats[0]) out.push({ id: 'count', question: `How many ${words(t.name)} rows are there per ${words(cats[cats.length > 1 ? 1 : 0].name)}?` });
  if (m && cats[0]) out.push({ id: 'rank', question: `Which ${words(cats[0].name)} has the highest average ${words(m.name)}?` });
  if (m && date) out.push({ id: 'month', question: `What is the total ${words(m.name)} by month?` });
  return out;
}

export async function safeSummary(def: DatasetDef): Promise<DatasetSummary> {
  try {
    return summarize(def, await analyzeDataset(def));
  } catch (err) {
    return {
      id: def.id, name: def.name, createdAt: def.createdAt,
      tables: [], rows: 0, score: 0, grade: 'Unknown', issues: { high: 0, medium: 0, low: 0, info: 0 }, duplicates: 0, questions: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function datasetDetail(def: DatasetDef, verify: boolean) {
  const a = await analyzeDataset(def);
  const v = verify ? await verifyCleaning(def, a) : undefined;
  return {
    summary: summarize(def, a),
    rules: def.rules,
    tables: a.tables.map((t) => ({
      name: t.name, rows: t.rows, pk: t.pk, desc: t.desc,
      dedupe: t.dedupe ? { mode: t.dedupe.mode, keys: t.dedupe.keys, sourceCol: t.dedupe.sourceCol, preferred: t.dedupe.preferred, orderCol: t.dedupe.orderCol, removed: t.dedupe.removed } : undefined,
      columns: t.columns.map((c) => ({ name: c.name, type: c.pgType, role: c.role, cleanType: c.cleanType, transform: c.transform, nonNull: c.nonNull, distinct: c.distinct, placeholders: c.placeholders, top: c.top, formats: c.formats, mapping: c.mapping, desc: c.desc })),
      cleanSql: t.cleanSelect,
    })),
    relationships: a.catalog.relationships,
    issues: a.issues,
    analyzedAt: a.analyzedAt,
    after: v ? {
      score: v.afterScore, grade: v.afterGrade, remaining: v.afterIssues, rowsBefore: v.rowsBefore, rowsAfter: v.rowsAfter, duplicatesLeft: v.duplicatesLeft,
    } : undefined,
  };
}
