import { withReadOnly, type RoQuery } from '@/server/db/pg';
import type { DatasetDef } from '@/server/datasets/registry';
import { catalog, qi, type Catalog, type CatColumn } from './catalog';

type Role = 'pk' | 'id' | 'measure' | 'category' | 'date' | 'timestamp' | 'period' | 'email' | 'label' | 'text' | 'source';
type CleanType = 'numeric' | 'date' | 'timestamp' | 'text';
export type IssueKind =
  | 'placeholder' | 'number_format' | 'scale_mix' | 'unparseable' | 'whitespace' | 'spelling_variants'
  | 'date_formats' | 'period_formats' | 'email_case' | 'numeric_text' | 'duplicates' | 'possible_duplicates' | 'undocumented';

export interface Issue {
  id: string;
  table: string;
  column?: string;
  kind: IssueKind;
  severity: 'high' | 'medium' | 'low' | 'info';
  count: number;
  title: string;
  examples: string[];
  fix: string;
}

interface ColumnPlan {
  name: string;
  pgType: string;
  role: Role;
  cleanType: CleanType;
  expr: string;
  /** Plain-English description of the cleaning applied, or '' when the column is kept as-is. */
  transform: string;
  nonNull: number;
  distinct: number;
  placeholders: number;
  top: { value: string; count: number }[];
  formats?: Record<string, number>;
  mapping?: Record<string, string>;
  desc?: string;
}

interface Dedupe { mode: 'key' | 'exact'; keys: string[]; sourceCol?: string; preferred?: string; orderCol?: string; removed: number; orderSql?: string }

export interface TablePlan {
  name: string;
  rows: number;
  pk?: string;
  desc?: string;
  columns: ColumnPlan[];
  dedupe?: Dedupe;
  typedSelect: string;
  cleanSelect: string;
}

export interface Analysis {
  datasetId: string;
  schema: string;
  catalog: Catalog;
  tables: TablePlan[];
  issues: Issue[];
  score: number;
  grade: Grade;
  /** `WITH <table> AS (...)` for every table: prefix any query to run it on cleaned data. */
  layer: string;
  rowsScanned: number;
  analyzedAt: string;
}

export type Grade = 'Clear' | 'Needs cleaning' | 'Unclear';

const PH_LIST = ['', 'N/A', 'NA', 'N.A.', '-', '--', 'NULL', 'NONE', '?', 'UNKNOWN', 'TBD', 'NIL', '#N/A', 'NAN'];
const PH = new Set(PH_LIST);
const PH_SQL = PH_LIST.map((p) => `'${p}'`).join(', ');
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

const NUM = {
  plain: /^-?\d+(\.\d+)?$/,
  thousands: /^-?\d{1,3}(,\d{3})+(\.\d+)?$/,
  currency: /^[$€£₹]\s?-?[\d,]+(\.\d+)?$/,
  ksuf: /^[$€£₹]?\s?-?\d+(\.\d+)?\s?[kK]$/,
  pct: /^-?\d+(\.\d+)?\s?%$/,
  ratio: /^\d+(\.\d+)?\s?\/\s?\d+(\.\d+)?$/,
};
type NumKind = keyof typeof NUM;
const NUM_LABEL: Record<NumKind, string> = { plain: 'plain number', thousands: "with commas ('1,240')", currency: "with a currency sign ('₹1240')", ksuf: "with k ('12k')", pct: "with % ('78%')", ratio: "as a fraction ('4.5/5')" };

function numKind(t: string): NumKind | null {
  for (const k of Object.keys(NUM) as NumKind[]) if (NUM[k].test(t)) return k;
  return null;
}

const DATE = {
  iso: /^\d{4}-\d{2}-\d{2}$/,
  slash: /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/,
  dmon: /^\d{1,2} [A-Za-z]{3,9},? \d{4}$/,
  mond: /^[A-Za-z]{3,9} \d{1,2},? \d{4}$/,
  compact: /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/,
};
type DateKind = keyof typeof DATE;
const DATE_LABEL: Record<DateKind, string> = { iso: 'YYYY-MM-DD', slash: 'MM/DD/YYYY', dmon: 'D Mon YYYY', mond: 'Mon D, YYYY', compact: 'YYYYMMDD' };
const TS = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERIOD = /^(\d{4})[-/](\d{2})$/;

function dateKind(t: string): DateKind | null {
  for (const k of Object.keys(DATE) as DateKind[]) if (DATE[k].test(t)) return k;
  return null;
}
const isPeriod = (t: string) => {
  const m = PERIOD.exec(t);
  return !!m && (Number(m[1]) + 1) % 100 === Number(m[2]);
};

const ID_NAME = /(^id$|_id$|_no$|_num$|_code$|_cd$|_key$|^code$)/i;
const YEAR_NAME = /(^|_)(yr|year|fy)$/i;
const SOURCE_NAME = /^(src|source|src_sys|source_system|origin|feed|system|sys)$|_(src|source)$/i;
const LABEL_NAME = /(_nm|_name|^name|title|description|desc|notes?|comment|remarks?)$/i;
const TEXT_TYPE = /char|text/;

const catKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '') || v.toLowerCase();

/**
 * Groups spelling variants of one label: case, spacing and punctuation ('Dine-in' / 'dine in'),
 * plurals ('Main' / 'Mains') and short abbreviations ('PRI' / 'Primary').
 * The canonical label is the most frequent spelling of the fullest form.
 */
function canonicalize(counts: Map<string, number>) {
  const groups = new Map<string, Map<string, number>>();
  for (const [v, n] of counts) {
    const k = catKey(v);
    const g = groups.get(k) ?? new Map<string, number>();
    g.set(v, (g.get(v) ?? 0) + n);
    groups.set(k, g);
  }
  const keys = [...groups.keys()].sort((a, b) => a.length - b.length);
  const parent = new Map<string, string>();
  for (const k of keys) {
    if (k.length < 3) continue;
    const longer = keys.filter((o) => o.length > k.length && o.startsWith(k));
    if (longer.length === 1 && (longer[0].length - k.length <= 1 || k.length <= 4)) parent.set(k, longer[0]);
  }
  const root = (k: string): string => (parent.has(k) ? root(parent.get(k)!) : k);
  const merged = new Map<string, { variants: Map<string, number>; full: Map<string, number> }>();
  for (const [k, g] of groups) {
    const r = root(k);
    const m = merged.get(r) ?? { variants: new Map<string, number>(), full: groups.get(r)! };
    g.forEach((n, v) => m.variants.set(v, (m.variants.get(v) ?? 0) + n));
    merged.set(r, m);
  }
  const style = (s: string) => (/[a-z]/.test(s) && /[A-Z]/.test(s) ? 'mixed' : s === s.toUpperCase() ? (s.replace(/[^A-Z]/g, '').length <= 4 ? 'acronym' : 'upper') : 'lower');
  const votes = new Map<string, number>();
  counts.forEach((n, v) => votes.set(style(v), (votes.get(style(v)) ?? 0) + n));
  const dominant = [...votes.entries()].filter(([s]) => s !== 'acronym').sort((a, b) => b[1] - a[1])[0]?.[0];
  const weight = (v: string, n: number) => n * (style(v) === 'mixed' || style(v) === 'acronym' ? 1.5 : 1) * (style(v) === dominant ? 1.5 : 1);
  const mapping: Record<string, string> = {};
  const out: { canonical: string; variants: [string, number][] }[] = [];
  for (const { variants, full } of merged.values()) {
    const canonical = [...full.entries()].sort((a, b) => weight(b[0], b[1]) - weight(a[0], a[1]) || a[0].localeCompare(b[0]))[0][0];
    variants.forEach((_, v) => { if (v !== canonical) mapping[v] = canonical; });
    out.push({ canonical, variants: [...variants.entries()].sort((a, b) => b[1] - a[1]) });
  }
  return { mapping, groups: out };
}

interface Profiled { plan: ColumnPlan; issues: Omit<Issue, 'id' | 'table'>[] }

function topValues(values: (string | null)[], n = 8) {
  const m = new Map<string, number>();
  values.forEach((v) => m.set(v === null ? '∅ (null)' : v === '' ? "'' (blank)" : v, (m.get(v === null ? '∅ (null)' : v === '' ? "'' (blank)" : v) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
}

/** Infers a column's role from its name, type and values, finds data-quality problems and builds its cleaning expression. */
function profileColumn(col: CatColumn, raw: (string | null)[]): Profiled {
  const { name } = col;
  const pgType = col.type.toLowerCase();
  const isText = TEXT_TYPE.test(pgType);
  const nonNullVals = raw.filter((v): v is string => v !== null);
  const trimmed = nonNullVals.map((v) => v.trim());
  const placeholders = isText ? trimmed.filter((t) => PH.has(t.toUpperCase())).length : 0;
  const real = isText ? trimmed.filter((t) => !PH.has(t.toUpperCase())) : trimmed;
  const padded = isText ? nonNullVals.filter((v) => v !== v.trim() && v.trim() !== '').length : 0;
  const distinct = new Set(real).size;
  const T = `TRIM(${qi(name)}::text)`;
  const PHX = `${T} IS NULL OR UPPER(${T}) IN (${PH_SQL})`;
  const issues: Omit<Issue, 'id' | 'table'>[] = [];
  const base = { name, pgType, nonNull: nonNullVals.length, distinct, placeholders, top: topValues(raw), desc: col.desc };
  const keep = (role: Role, cleanType: CleanType): Profiled => ({ plan: { ...base, role, cleanType, expr: qi(name), transform: '' }, issues });

  const share = (pred: (t: string) => boolean) => (real.length ? real.filter(pred).length / real.length : 0);
  const typedAs = (): CleanType => (/int|numeric|real|double|decimal|money/.test(pgType) ? 'numeric' : /timestamp/.test(pgType) ? 'timestamp' : pgType === 'date' ? 'date' : 'text');

  if (placeholders > 0) {
    const tokens = [...new Set(trimmed.filter((t) => PH.has(t.toUpperCase())))].map((t) => (t === '' ? "'' (blank)" : `'${t}'`));
    issues.push({
      column: name, kind: 'placeholder', severity: 'medium', count: placeholders,
      title: `${placeholders} ${name} value${placeholders === 1 ? ' is' : 's are'} ${tokens.slice(0, 3).join(' / ')}, meaning "missing"`,
      examples: tokens.slice(0, 4), fix: 'Read as missing (NULL), never as 0',
    });
  }
  if (padded > 0) {
    issues.push({
      column: name, kind: 'whitespace', severity: 'low', count: padded,
      title: `${padded} ${name} value${padded === 1 ? ' has' : 's have'} stray spaces`,
      examples: nonNullVals.filter((v) => v !== v.trim()).slice(0, 3).map((v) => `'${v}'`), fix: 'Trim spaces',
    });
  }

  if (col.pk) return keep('pk', typedAs());
  if (!isText) {
    const t = typedAs();
    if (ID_NAME.test(name) || col.fk) return keep('id', t);
    if (t === 'numeric') return keep(YEAR_NAME.test(name) ? 'period' : 'measure', 'numeric');
    if (t === 'date') return keep('date', 'date');
    if (t === 'timestamp') return keep('timestamp', 'timestamp');
    return keep('category', 'text');
  }

  const textExpr = `CASE WHEN ${PHX} THEN NULL ELSE ${T} END`;
  const cleanedNote = (parts: string[]) => parts.filter(Boolean).join('; ');
  const phNote = placeholders ? "'N/A'-style tokens → missing" : '';
  const trimNote = padded ? 'trim spaces' : '';

  if (ID_NAME.test(name) || col.fk) {
    const allInt = real.length > 0 && real.every((t) => /^-?\d+$/.test(t));
    return {
      plan: {
        ...base, role: 'id', cleanType: allInt ? 'numeric' : 'text',
        expr: allInt ? `(${textExpr})::bigint` : textExpr, transform: cleanedNote([phNote, trimNote]),
      },
      issues,
    };
  }

  if (real.length && share(isPeriod) >= 0.8) {
    const slash = real.filter((t) => t.includes('/')).length;
    const formats = { 'YYYY-YY': real.length - slash, 'YYYY/YY': slash };
    if (slash && slash < real.length) {
      issues.push({
        column: name, kind: 'period_formats', severity: 'medium', count: slash,
        title: `${name} writes the same year two ways ('${real.find((t) => t.includes('-'))}' and '${real.find((t) => t.includes('/'))}')`,
        examples: [real.find((t) => t.includes('-'))!, real.find((t) => t.includes('/'))!], fix: 'Normalise to YYYY-YY',
      });
    }
    return {
      plan: {
        ...base, role: 'period', cleanType: 'text', formats,
        expr: `CASE WHEN ${PHX} THEN NULL WHEN ${T} ~ '^\\d{4}[-/]\\d{2}$' THEN LEFT(${T}, 4) || '-' || RIGHT(${T}, 2) ELSE ${T} END`,
        transform: cleanedNote([slash ? "'YYYY/YY' → 'YYYY-YY'" : '', phNote, trimNote]),
      },
      issues,
    };
  }

  if (real.length && share((t) => TS.test(t)) >= 0.8) {
    return {
      plan: {
        ...base, role: 'timestamp', cleanType: 'timestamp',
        expr: `CASE WHEN ${PHX} THEN NULL WHEN ${T} ~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}' THEN LEFT(REPLACE(${T}, 'T', ' '), 19)::timestamp ELSE NULL END`,
        transform: cleanedNote(['text → timestamp', phNote]),
      },
      issues,
    };
  }

  const dk = real.map(dateKind);
  const nonCompactDates = dk.filter((k) => k && k !== 'compact').length;
  if (real.length && dk.filter(Boolean).length / real.length >= 0.8 && (nonCompactDates > 0 || /date|_dt$|day/i.test(name))) {
    const dayFirst = real.some((t) => DATE.slash.test(t) && Number(t.split(/[/.-]/)[0]) > 12);
    const formats: Record<string, number> = {};
    dk.forEach((k) => {
      const label = k === 'slash' && dayFirst ? 'DD/MM/YYYY' : k ? DATE_LABEL[k] : 'unreadable';
      formats[label] = (formats[label] ?? 0) + 1;
    });
    const kinds = Object.keys(formats).filter((f) => f !== 'unreadable');
    if (kinds.length > 1) {
      const ex = kinds.map((f) => real[dk.findIndex((k) => k && (k === 'slash' && dayFirst ? 'DD/MM/YYYY' : DATE_LABEL[k]) === f)]);
      issues.push({
        column: name, kind: 'date_formats', severity: 'high', count: real.length - (formats[kinds.sort((a, b) => formats[b] - formats[a])[0]] ?? 0),
        title: `${name} mixes ${kinds.length} date formats`, examples: ex.map((e) => `'${e}'`), fix: `Parse every format into a real date${dk.includes('slash') ? (dayFirst ? ' (slashes read as DD/MM)' : ' (slashes read as MM/DD)') : ''}`,
      });
    }
    const bad = formats.unreadable ?? 0;
    if (bad) issues.push({ column: name, kind: 'unparseable', severity: 'medium', count: bad, title: `${bad} ${name} value${bad === 1 ? '' : 's'} can't be read as dates`, examples: real.filter((_, i) => !dk[i]).slice(0, 3).map((e) => `'${e}'`), fix: 'Treated as missing' });
    const TC = `REPLACE(${T}, ',', '')`;
    const expr = `CASE WHEN ${PHX} THEN NULL
      WHEN ${T} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN TO_DATE(LEFT(${T}, 10), 'YYYY-MM-DD')
      WHEN ${T} ~ '^\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4}$' THEN TO_DATE(REGEXP_REPLACE(${T}, '[.-]', '/', 'g'), '${dayFirst ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}')
      WHEN ${TC} ~ '^\\d{1,2} [A-Za-z]{3,9} \\d{4}$' THEN TO_DATE(SPLIT_PART(${TC}, ' ', 1) || ' ' || LEFT(SPLIT_PART(${TC}, ' ', 2), 3) || ' ' || SPLIT_PART(${TC}, ' ', 3), 'DD Mon YYYY')
      WHEN ${TC} ~ '^[A-Za-z]{3,9} \\d{1,2} \\d{4}$' THEN TO_DATE(LEFT(SPLIT_PART(${TC}, ' ', 1), 3) || ' ' || SPLIT_PART(${TC}, ' ', 2) || ' ' || SPLIT_PART(${TC}, ' ', 3), 'Mon DD YYYY')
      WHEN ${T} ~ '^(19|20)\\d{6}$' THEN TO_DATE(${T}, 'YYYYMMDD')
      ELSE NULL END`;
    return {
      plan: { ...base, role: 'date', cleanType: 'date', formats, expr, transform: cleanedNote([kinds.length > 1 ? `${kinds.length} date formats → one date` : 'text → date', phNote]) },
      issues,
    };
  }

  if (real.length && share((t) => EMAIL.test(t)) >= 0.8) {
    const upper = real.filter((t) => t !== t.toLowerCase()).length;
    if (upper) issues.push({ column: name, kind: 'email_case', severity: 'low', count: upper, title: `${upper} email${upper === 1 ? ' has' : 's have'} capital letters, so the same person looks different`, examples: real.filter((t) => t !== t.toLowerCase()).slice(0, 3).map((e) => `'${e}'`), fix: 'Lower-case emails' });
    return { plan: { ...base, role: 'email', cleanType: 'text', expr: `CASE WHEN ${PHX} THEN NULL ELSE LOWER(${T}) END`, transform: cleanedNote([upper ? 'lower-case' : '', phNote, trimNote]) }, issues };
  }

  const nk = real.map(numKind);
  if (real.length && nk.filter(Boolean).length / real.length >= 0.8) {
    const formats: Record<string, number> = {};
    nk.forEach((k) => { const l = k ? NUM_LABEL[k] : 'unreadable'; formats[l] = (formats[l] ?? 0) + 1; });
    const plainVals = real.filter((_, i) => nk[i] === 'plain').map(Number);
    const fractions = plainVals.filter((v) => Math.abs(v) < 1 && v !== 0).length;
    const percentScale = fractions > 0 && (nk.includes('pct') || plainVals.some((v) => v > 1)) && fractions < real.length;
    const ratios = real.filter((_, i) => nk[i] === 'ratio');
    const denoms = new Map<number, number>();
    ratios.forEach((r) => { const d = Number(r.split('/')[1]); denoms.set(d, (denoms.get(d) ?? 0) + 1); });
    const D = [...denoms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
    const fancy = nk.filter((k) => k && k !== 'plain' && !(k === 'pct' && percentScale)).length;
    if (fancy) {
      const kinds = [...new Set(nk.filter((k): k is NumKind => !!k && k !== 'plain'))];
      issues.push({
        column: name, kind: 'number_format', severity: 'high', count: fancy,
        title: `${fancy} ${name} value${fancy === 1 ? ' is' : 's are'} written ${kinds.map((k) => NUM_LABEL[k]).join(', ')}`,
        examples: kinds.map((k) => `'${real[nk.indexOf(k)]}'`), fix: `Strip symbols and separators${kinds.includes('ksuf') ? ', k = ×1000' : ''}${kinds.includes('ratio') ? `, '4.5/${D}' → 4.5` : ''}`,
      });
    }
    if (percentScale) {
      issues.push({
        column: name, kind: 'scale_mix', severity: 'high', count: fractions,
        title: `${name} mixes percentages and fractions (${real.find((_, i) => nk[i] === 'pct' || (nk[i] === 'plain' && Number(real[i]) > 1))} vs ${real.find((t) => NUM.plain.test(t) && Math.abs(Number(t)) < 1)})`,
        examples: [real.find((_, i) => nk[i] === 'pct') ?? '', real.find((t) => NUM.plain.test(t) && Math.abs(Number(t)) < 1) ?? ''].filter(Boolean).map((e) => `'${e}'`),
        fix: 'Put every value on a 0–100 scale',
      });
    }
    const bad = formats.unreadable ?? 0;
    if (bad) issues.push({ column: name, kind: 'unparseable', severity: 'medium', count: bad, title: `${bad} ${name} value${bad === 1 ? '' : 's'} can't be read as numbers`, examples: real.filter((_, i) => !nk[i]).slice(0, 3).map((e) => `'${e}'`), fix: 'Treated as missing' });
    const S = `REGEXP_REPLACE(${T}, '[$€£₹,\\s]', '', 'g')`;
    const expr = `CASE WHEN ${PHX} THEN NULL
      WHEN ${T} ~ '^[$€£₹]?\\s?-?\\d+(\\.\\d+)?\\s?[kK]$' THEN REGEXP_REPLACE(${T}, '[^0-9.-]', '', 'g')::numeric * 1000
      WHEN ${T} ~ '^-?\\d+(\\.\\d+)?\\s?%$' THEN REGEXP_REPLACE(${T}, '[^0-9.-]', '', 'g')::numeric
      WHEN ${T} ~ '^\\d+(\\.\\d+)?\\s?/\\s?\\d+(\\.\\d+)?$' THEN ROUND(TRIM(SPLIT_PART(${T}, '/', 1))::numeric / NULLIF(TRIM(SPLIT_PART(${T}, '/', 2))::numeric, 0) * ${D}, 4)${percentScale ? `
      WHEN ${T} ~ '^-?0?\\.\\d+$' THEN ${T}::numeric * 100` : ''}
      WHEN ${S} ~ '^-?\\d+(\\.\\d+)?$' THEN ${S}::numeric
      ELSE NULL END`;
    return {
      plan: {
        ...base, role: 'measure', cleanType: 'numeric', formats, expr,
        transform: cleanedNote(['text → number', fancy ? 'strip ₹ $ , and expand k' : '', percentScale ? 'fractions × 100' : '', ratios.length ? `'x/${D}' → x` : '', phNote]),
      },
      issues,
    };
  }

  const keyCount = new Set(real.map(catKey)).size;
  if (SOURCE_NAME.test(name) && keyCount <= 6) {
    return { plan: { ...base, role: 'source', cleanType: 'text', expr: textExpr, transform: cleanedNote([phNote, trimNote]) }, issues };
  }
  if (LABEL_NAME.test(name)) {
    return { plan: { ...base, role: 'label', cleanType: 'text', expr: textExpr, transform: cleanedNote([phNote, trimNote]) }, issues };
  }
  const avgLen = real.reduce((s, t) => s + t.length, 0) / Math.max(1, real.length);
  if (real.length && keyCount <= Math.max(12, real.length * 0.2) && avgLen <= 32) {
    const counts = new Map<string, number>();
    real.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    const { mapping, groups } = canonicalize(counts);
    const split = groups.filter((g) => g.variants.length > 1);
    if (split.length) {
      const affected = split.reduce((s, g) => s + g.variants.filter(([v]) => v !== g.canonical).reduce((a, [, n]) => a + n, 0), 0);
      const nVariants = split.reduce((s, g) => s + g.variants.length, 0);
      issues.push({
        column: name, kind: 'spelling_variants', severity: 'high', count: affected,
        title: `${name} spells ${split.length} value${split.length === 1 ? '' : 's'} ${nVariants} different ways`,
        examples: split.slice(0, 3).map((g) => `${g.variants.map(([v]) => `'${v}'`).join(', ')} → '${g.canonical}'`),
        fix: 'Merge spellings into one label each',
      });
    }
    const entries = Object.entries(mapping);
    const expr = entries.length
      ? `CASE WHEN ${PHX} THEN NULL ${entries.map(([v, c]) => `WHEN ${T} = ${lit(v)} THEN ${lit(c)}`).join(' ')} ELSE ${T} END`
      : textExpr;
    return {
      plan: { ...base, role: 'category', cleanType: 'text', expr, mapping: entries.length ? mapping : undefined, transform: cleanedNote([entries.length ? `merge ${entries.length} spelling variant${entries.length === 1 ? '' : 's'}` : '', phNote, trimNote]) },
      issues,
    };
  }
  return { plan: { ...base, role: 'text', cleanType: 'text', expr: textExpr, transform: cleanedNote([phNote, trimNote]) }, issues };
}

const CAP: Record<IssueKind, [number, number]> = {
  placeholder: [4, 12], number_format: [6, 14], scale_mix: [8, 10], unparseable: [4, 8], whitespace: [2, 6],
  spelling_variants: [6, 16], date_formats: [6, 12], period_formats: [5, 6], email_case: [4, 4], numeric_text: [1, 4],
  duplicates: [10, 15], possible_duplicates: [0, 0], undocumented: [1, 3],
};

/** 100 = every column is typed, consistent and unique; each kind of problem costs points up to a cap. */
function clarityScore(issues: Pick<Issue, 'kind'>[]): { score: number; grade: Grade } {
  const per = new Map<IssueKind, number>();
  issues.forEach((i) => per.set(i.kind, (per.get(i.kind) ?? 0) + CAP[i.kind][0]));
  let pen = 0;
  per.forEach((p, k) => { pen += Math.min(p, CAP[k][1]); });
  const score = Math.max(0, Math.round(100 - pen));
  return { score, grade: score >= 85 ? 'Clear' : score >= 60 ? 'Needs cleaning' : 'Unclear' };
}

const asText = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

export function withLayer(layer: string, sql: string) {
  const s = sql.trim().replace(/;+\s*$/, '');
  if (!layer) return s;
  return /^with\s/i.test(s) ? `${layer},\n${s.replace(/^with\s+/i, '')}` : `${layer}\n${s}`;
}

async function dupCount(q: RoQuery, layer: string, table: string, keys: string[]) {
  if (!keys.length) return 0;
  const [r] = await q<{ n: number }>(withLayer(layer, `SELECT COALESCE(SUM(n - 1), 0)::int AS n FROM (SELECT COUNT(*) AS n FROM ${qi(table)} GROUP BY ${keys.map(qi).join(', ')}) g`));
  return r.n;
}

const cache = new Map<string, { at: number; a: Analysis }>();

/** Drops the cached analysis so the next read picks up a changed data dictionary. */
export function forgetAnalysis(datasetId: string) {
  cache.delete(datasetId);
  vcache.delete(datasetId);
}

export async function analyzeDataset(def: DatasetDef, opts: { fresh?: boolean } = {}): Promise<Analysis> {
  const hit = cache.get(def.id);
  if (hit && !opts.fresh && Date.now() - hit.at < 10 * 60_000) return hit.a;
  const schema = def.messySchema;
  const cat = await catalog(schema, def, 0);
  const documented = Object.keys(def.tables).length > 0;

  const a = await withReadOnly(schema, async (q) => {
    const tables: TablePlan[] = [];
    const issues: Issue[] = [];
    let rowsScanned = 0;
    for (const t of cat.tables) {
      const { columns, rows } = await q.arrays(`SELECT * FROM ${qi(t.name)} LIMIT 5000`);
      rowsScanned += rows.length;
      const plans: ColumnPlan[] = [];
      columns.forEach((c, i) => {
        const col = t.columns.find((x) => x.name === c)!;
        const p = profileColumn(col, rows.map((r) => asText(r[i])));
        plans.push(p.plan);
        p.issues.forEach((x) => issues.push({ ...x, id: `${t.name}.${c}.${x.kind}`, table: t.name }));
        if (documented && !col.desc && !col.pk) {
          issues.push({ id: `${t.name}.${c}.undocumented`, table: t.name, column: c, kind: 'undocumented', severity: 'info', count: 0, title: `${t.name}.${c} is not in the data dictionary`, examples: [], fix: 'Meaning inferred from the values' });
        }
      });
      const pk = t.columns.find((c) => c.pk)?.name;
      const typedSelect = `SELECT ${plans.map((p) => (p.expr === qi(p.name) ? qi(p.name) : `${p.expr} AS ${qi(p.name)}`)).join(',\n    ')}\n  FROM ${schema}.${qi(t.name)}`;
      tables.push({ name: t.name, rows: t.rows, pk, desc: t.desc, columns: plans, typedSelect, cleanSelect: typedSelect });
    }

    const typedLayer = `WITH ${tables.map((t) => `${qi(t.name)} AS (\n  ${t.typedSelect}\n)`).join(',\n')}`;
    for (const t of tables) {
      const nonPk = t.columns.filter((c) => c.role !== 'pk');
      const keyCols = nonPk.filter((c) => !['measure', 'source', 'timestamp'].includes(c.role)).map((c) => c.name);
      const src = t.columns.find((c) => c.role === 'source');
      const ts = t.columns.find((c) => c.role === 'timestamp');
      const synthetic = !t.pk || t.pk === 'row_id';
      let dedupe: Dedupe | undefined;
      if (src && keyCols.length) {
        const removed = await dupCount(q, typedLayer, t.name, keyCols);
        if (removed) {
          const preferred = src.top.find((v) => !v.value.startsWith('∅') && !v.value.startsWith("''"))?.value;
          dedupe = { mode: 'key', keys: keyCols, sourceCol: src.name, preferred, orderCol: ts?.name, removed };
        }
      }
      if (!dedupe && nonPk.length) {
        const exact = await dupCount(q, typedLayer, t.name, nonPk.map((c) => c.name));
        if (exact && synthetic) dedupe = { mode: 'exact', keys: nonPk.map((c) => c.name), removed: exact };
        else if (exact) {
          issues.push({ id: `${t.name}.possible_duplicates`, table: t.name, kind: 'possible_duplicates', severity: 'info', count: exact, title: `${exact} ${t.name} row${exact === 1 ? ' looks' : 's look'} identical to another`, examples: [], fix: 'Kept: each has its own id and there is no source column to tell copies apart' });
        }
      }
      if (dedupe) {
        t.dedupe = dedupe;
        const order = [
          dedupe.sourceCol && dedupe.preferred ? `CASE WHEN ${qi(dedupe.sourceCol)} = ${lit(dedupe.preferred)} THEN 0 ELSE 1 END` : '',
          dedupe.orderCol ? `${qi(dedupe.orderCol)} DESC NULLS LAST` : '',
          t.pk ? qi(t.pk) : '',
        ].filter(Boolean).join(', ') || '1';
        dedupe.orderSql = order;
        t.cleanSelect = `SELECT ${t.columns.map((c) => qi(c.name)).join(', ')} FROM (\n    SELECT x.*, ROW_NUMBER() OVER (PARTITION BY ${dedupe.keys.map(qi).join(', ')} ORDER BY ${order}) AS qp_rn\n    FROM (${t.typedSelect}) x\n  ) y WHERE qp_rn = 1`;
        issues.push({
          id: `${t.name}.duplicates`, table: t.name, kind: 'duplicates', severity: 'high', count: dedupe.removed,
          title: dedupe.mode === 'key'
            ? `${dedupe.removed} ${t.name} row${dedupe.removed === 1 ? ' is a copy' : 's are copies'} of the same record from another source`
            : `${dedupe.removed} ${t.name} row${dedupe.removed === 1 ? ' is' : 's are'} exact duplicates`,
          examples: dedupe.mode === 'key' ? [`same ${dedupe.keys.slice(0, 4).join(' + ')}`] : [],
          fix: dedupe.mode === 'key' ? `Keep one row per record, preferring ${dedupe.sourceCol} = '${dedupe.preferred}'${dedupe.orderCol ? `, then the latest ${dedupe.orderCol}` : ''}` : 'Keep one copy',
        });
      }
    }
    const layer = `WITH ${tables.map((t) => `${qi(t.name)} AS (\n  ${t.cleanSelect}\n)`).join(',\n')}`;
    const { score, grade } = clarityScore(issues);
    return { datasetId: def.id, schema, catalog: cat, tables, issues, score, grade, layer, rowsScanned, analyzedAt: new Date().toISOString() } satisfies Analysis;
  }, 25_000);
  cache.set(def.id, { at: Date.now(), a });
  return a;
}

interface CleanVerification {
  afterIssues: Issue[];
  afterScore: number;
  afterGrade: Grade;
  rowsBefore: Record<string, number>;
  rowsAfter: Record<string, number>;
  duplicatesLeft: number;
}

const vcache = new Map<string, { at: number; v: CleanVerification }>();

/** Re-profiles the cleaned layer with the same rules. */
export async function verifyCleaning(def: DatasetDef, a: Analysis): Promise<CleanVerification> {
  const hit = vcache.get(def.id);
  if (hit && hit.v && Date.now() - hit.at < 10 * 60_000 && cache.get(def.id)?.a === a) return hit.v;
  const v = await withReadOnly(a.schema, async (q) => {
    const afterIssues: Issue[] = [];
    const rowsBefore: Record<string, number> = {};
    const rowsAfter: Record<string, number> = {};
    let duplicatesLeft = 0;
    for (const t of a.tables) {
      const { columns, rows } = await q.arrays(withLayer(a.layer, `SELECT * FROM ${qi(t.name)} LIMIT 5000`));
      rowsBefore[t.name] = t.rows;
      const [{ n }] = await q<{ n: number }>(withLayer(a.layer, `SELECT COUNT(*)::int AS n FROM ${qi(t.name)}`));
      rowsAfter[t.name] = n;
      columns.forEach((c, i) => {
        const p = t.columns.find((x) => x.name === c)!;
        const type = p.cleanType === 'numeric' ? 'numeric' : p.cleanType === 'date' ? 'date' : p.cleanType === 'timestamp' ? 'timestamp without time zone' : 'text';
        const res = profileColumn({ name: c, type, pk: p.role === 'pk' }, rows.map((r) => asText(r[i])));
        res.issues.forEach((x) => afterIssues.push({ ...x, id: `${t.name}.${c}.${x.kind}`, table: t.name }));
      });
      if (t.dedupe) duplicatesLeft += await dupCount(q, a.layer, t.name, t.dedupe.keys);
    }
    a.issues.filter((i) => i.kind === 'undocumented' || i.kind === 'possible_duplicates').forEach((i) => afterIssues.push(i));
    const { score, grade } = clarityScore(afterIssues);
    return { afterIssues, afterScore: score, afterGrade: grade, rowsBefore, rowsAfter, duplicatesLeft } as CleanVerification;
  }, 25_000);
  vcache.set(def.id, { at: Date.now(), v });
  return v;
}
