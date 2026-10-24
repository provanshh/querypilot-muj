import { withReadOnly } from '@/server/db/pg';
import type { Analysis } from './analyze';
import { qi } from './catalog';

interface CompareCell { raw: string | null; clean: string | number | null; changed: boolean }
export interface CompareRow { id: string; status: 'kept' | 'dropped'; cells: CompareCell[] }
export interface ColumnStat {
  column: string;
  role: string;
  transform: string;
  before: { filled: number; missingTokens: number; distinct: number; formats?: Record<string, number> };
  after: { filled: number; distinct: number; min?: string | number; max?: string | number; sum?: number };
  changedCells: number;
}
export interface Distribution { column: string; before: { value: string; count: number }[]; after: { value: string; count: number }[] }
export interface TableCompare {
  table: string;
  columns: string[];
  totals: { rows: number; changedRows: number; droppedRows: number; changedCells: number };
  /** Rows matching the filter and search, before paging. */
  matching: number;
  offset: number;
  rows: CompareRow[];
  stats: ColumnStat[];
  distributions: Distribution[];
  dedupe?: { keys: string[]; preferred?: string; sourceCol?: string };
}

const PH = /^(|N\/A|NA|N\.A\.|-|--|NULL|NONE|\?|UNKNOWN|TBD|NIL|#N\/A|NAN)$/i;

function same(raw: string | null, clean: unknown) {
  if (raw === null) return clean === null;
  if (clean === null || clean === undefined) return false;
  if (typeof clean === 'number') return raw.trim() !== '' && Number(raw) === clean && raw === raw.trim();
  return String(clean) === raw;
}

/** Raw and cleaned value of every cell, aligned row by row, plus which rows the dedupe step drops. */
export async function compareTable(
  a: Analysis, table: string, filter: 'changed' | 'dropped' | 'all' = 'changed', limit = 40, opts: { offset?: number; search?: string } = {},
): Promise<TableCompare> {
  const t = a.tables.find((x) => x.name === table);
  if (!t) throw new Error('Unknown table');
  const cols = t.columns;
  const inner = `SELECT ctid::text AS qp_row, ${cols.map((c) => `${c.expr} AS ${qi(c.name)}`).join(', ')}, ${cols.map((c, i) => `${qi(c.name)}::text AS raw__${i}`).join(', ')} FROM ${a.schema}.${qi(t.name)}`;
  const sql = t.dedupe
    ? `SELECT x.*, ROW_NUMBER() OVER (PARTITION BY ${t.dedupe.keys.map(qi).join(', ')} ORDER BY ${t.dedupe.orderSql ?? '1'}) AS qp_rn FROM (${inner}) x LIMIT 5000`
    : `SELECT x.*, 1 AS qp_rn FROM (${inner}) x LIMIT 5000`;
  const data = await withReadOnly(a.schema, (q) => q<Record<string, unknown>>(sql), 20_000);

  const rows: CompareRow[] = data.map((r) => ({
    id: String(r.qp_row),
    status: Number(r.qp_rn) === 1 ? 'kept' : 'dropped',
    cells: cols.map((c, i) => {
      const raw = (r[`raw__${i}`] as string | null) ?? null;
      const clean = (r[c.name] as string | number | null) ?? null;
      return { raw, clean, changed: !same(raw, clean) };
    }),
  }));
  const changedRows = rows.filter((r) => r.cells.some((c) => c.changed));
  const dropped = rows.filter((r) => r.status === 'dropped');

  const stats: ColumnStat[] = cols.map((c, i) => {
    const raws = rows.map((r) => r.cells[i].raw);
    const kept = rows.filter((r) => r.status === 'kept').map((r) => r.cells[i].clean);
    const filledAfter = kept.filter((v) => v !== null);
    const nums = filledAfter.filter((v): v is number => typeof v === 'number');
    const sorted = [...filledAfter].sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))));
    return {
      column: c.name, role: c.role, transform: c.transform,
      before: {
        filled: raws.filter((v) => v !== null && !PH.test(v.trim())).length,
        missingTokens: raws.filter((v) => v !== null && PH.test(v.trim())).length + raws.filter((v) => v === null).length,
        distinct: new Set(raws.filter((v) => v !== null)).size,
        formats: c.formats,
      },
      after: {
        filled: filledAfter.length,
        distinct: new Set(filledAfter.map(String)).size,
        min: ['measure', 'date', 'timestamp', 'period'].includes(c.role) ? sorted[0] ?? undefined : undefined,
        max: ['measure', 'date', 'timestamp', 'period'].includes(c.role) ? sorted[sorted.length - 1] ?? undefined : undefined,
        sum: c.role === 'measure' && nums.length ? Math.round(nums.reduce((s, x) => s + x, 0) * 100) / 100 : undefined,
      },
      changedCells: rows.filter((r) => r.cells[i].changed).length,
    };
  });

  const distributions: Distribution[] = cols
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.role === 'category' || c.role === 'source' || c.role === 'period')
    .map(({ c, i }) => {
      const count = (vals: (string | number | null)[]) => {
        const m = new Map<string, number>();
        vals.forEach((v) => {
          const k = v === null ? '(missing)' : String(v) === '' ? "'' (blank)" : String(v);
          m.set(k, (m.get(k) ?? 0) + 1);
        });
        return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([value, n]) => ({ value, count: n }));
      };
      return {
        column: c.name,
        before: count(rows.map((r) => r.cells[i].raw)),
        after: count(rows.filter((r) => r.status === 'kept').map((r) => r.cells[i].clean)),
      };
    });

  let pickFrom = filter === 'dropped' ? dropped : filter === 'all' ? rows : opts.offset || opts.search ? changedRows : [...dropped.slice(0, Math.ceil(limit / 4)), ...changedRows.filter((r) => r.status === 'kept')];
  const needle = opts.search?.trim().toLowerCase();
  if (needle) pickFrom = pickFrom.filter((r) => r.cells.some((c) => (c.raw ?? '').toLowerCase().includes(needle) || String(c.clean ?? '').toLowerCase().includes(needle)));
  const offset = Math.max(0, Math.min(opts.offset ?? 0, Math.max(0, pickFrom.length - 1)));
  return {
    table: t.name,
    columns: cols.map((c) => c.name),
    totals: { rows: rows.length, changedRows: changedRows.length, droppedRows: dropped.length, changedCells: stats.reduce((s, x) => s + x.changedCells, 0) },
    matching: pickFrom.length,
    offset,
    rows: pickFrom.slice(offset, offset + limit),
    stats,
    distributions,
    dedupe: t.dedupe ? { keys: t.dedupe.keys, preferred: t.dedupe.preferred, sourceCol: t.dedupe.sourceCol } : undefined,
  };
}
