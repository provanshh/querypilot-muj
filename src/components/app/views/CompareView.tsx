'use client';

import { useState } from 'react';
import { ArrowRight, Copy, Eraser, Rows3, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarList } from '../charts';
import type { Theme } from '../theme';
import { Badge, Card, CardHeader, Kpi, Segmented, Skeleton, fmt } from '../ui';
import { useCompare, type DatasetDetail, type DatasetSummary } from '../useData';

const PALETTE = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316', '#14b8a6', '#64748b', '#a855f7', '#0ea5e9', '#e11d48'];

function Cell({ raw, clean, changed }: { raw: string | null; clean: string | number | null; changed: boolean }) {
  if (!changed) return <span className="text-black/60">{raw === null ? <span className="text-black/25">∅</span> : raw}</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-[10.5px] text-rose-500 line-through decoration-rose-300">{raw === null ? '∅' : raw === '' ? "''" : raw}</span>
      <span className="font-medium text-emerald-700">{clean === null ? <span className="italic text-black/35">missing</span> : fmt(clean)}</span>
    </span>
  );
}

export function CompareView({ dataset, detail, theme }: { dataset: DatasetSummary; detail: DatasetDetail | null; theme: Theme }) {
  const tables = detail?.tables ?? [];
  const defaultTable = [...tables].sort((a, b) => (b.dedupe?.removed ?? 0) - (a.dedupe?.removed ?? 0) || b.columns.filter((c) => c.transform).length - a.columns.filter((c) => c.transform).length)[0]?.name;
  const [picked, setPicked] = useState<string | undefined>();
  const table = picked && tables.some((t) => t.name === picked) ? picked : defaultTable;
  const [filter, setFilter] = useState<'changed' | 'dropped' | 'all'>('changed');
  const { data, error } = useCompare(dataset.id, table, filter);
  const after = detail?.after;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn('grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br text-white transition-transform duration-500 hover:rotate-12 hover:scale-110', theme.gradient)}><Sparkles className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-[#1d1d1f]">Old data vs new data</h2>
            <p className="text-[13px] text-black/60">Every original value next to the value the agents read after cleaning. The original tables in the database are unchanged.</p>
          </div>
          <div className="ml-auto flex items-center gap-3 rounded-full bg-[#f4f4f4] px-4 py-2">
            <span className="text-[12px] text-black/45">Clarity</span>
            <span className="text-[18px] font-semibold tabular-nums text-rose-600">{dataset.score}</span>
            <ArrowRight className="h-4 w-4 text-black/25" />
            <span className="text-[18px] font-semibold tabular-nums text-emerald-600">{after?.score ?? '…'}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tables.map((t) => (
            <button
              key={t.name}
              onClick={() => setPicked(t.name)}
              className={cn('rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all active:scale-[0.97]', table === t.name ? cn(theme.border, theme.bgSoft, theme.text) : 'border-black/[0.07] text-black/60 hover:border-black/20 hover:bg-[#f6f6f6]')}
            >
              <span className="font-mono">{t.name}</span>
              <span className="ml-1.5 text-black/35">{t.rows.toLocaleString()}</span>
            </button>
          ))}
          <Segmented className="ml-auto" value={filter} onChange={setFilter} options={[{ value: 'changed', label: 'Changed rows' }, { value: 'dropped', label: 'Removed duplicates' }, { value: 'all', label: 'All rows' }]} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Rows" value={data ? <span>{data.totals.rows.toLocaleString()} <span className="text-black/25">→</span> {(data.totals.rows - data.totals.droppedRows).toLocaleString()}</span> : '…'} sub={table ? `in ${table}` : ''} icon={<Rows3 className="h-4 w-4" />} accent={theme.hex} />
        <Kpi label="Cells corrected" value={data ? data.totals.changedCells.toLocaleString() : '…'} sub={data ? `in ${data.totals.changedRows.toLocaleString()} rows` : ''} icon={<Eraser className="h-4 w-4" />} accent="#059669" />
        <Kpi label="Duplicates removed" value={data ? data.totals.droppedRows : '…'} sub={data?.dedupe ? `same ${data.dedupe.keys.slice(0, 3).join(' + ')}${data.dedupe.keys.length > 3 ? '…' : ''}` : 'none in this table'} icon={<Copy className="h-4 w-4" />} accent="#d97706" />
        <Kpi label="Categories" value={data ? data.distributions.map((d) => `${d.before.length}→${d.after.length}`).join(', ') || '—' : '…'} sub="distinct spellings before → after" icon={<Sparkles className="h-4 w-4" />} accent="#7c3aed" />
      </div>

      <Card>
        <CardHeader title={`${table ?? ''}: row by row`} subtitle={<span>Struck-through red is the original value; green is what the agents read. Rows marked <Badge tone="red">duplicate</Badge> are excluded.</span>} />
        <div className="px-4 pb-4">
          {error && <div className="rounded-2xl bg-rose-50 p-3 text-[12.5px] text-rose-700">{error}</div>}
          {!data && !error && <Skeleton className="h-64" />}
          {data && (
            <div className="max-h-[520px] overflow-auto rounded-2xl border border-black/[0.07]">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 z-10 bg-[#f6f6f6] text-black/45">
                  <tr>
                    <th className="px-2.5 py-2 text-left font-medium">status</th>
                    {data.columns.map((c) => <th key={c} className="px-2.5 py-2 text-left font-mono font-medium whitespace-nowrap">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={cn('border-t border-black/[0.05] align-top transition-colors', r.status === 'dropped' ? 'bg-rose-50/60 hover:bg-rose-50' : 'hover:bg-[#f6f6f6]')}>
                      <td className="px-2.5 py-1.5">{r.status === 'dropped' ? <Badge tone="red">duplicate</Badge> : <Badge tone="green">kept</Badge>}</td>
                      {r.cells.map((c, i) => (
                        <td key={i} className={cn('px-2.5 py-1.5 font-mono whitespace-nowrap', c.changed && 'bg-emerald-50/40')}>
                          <Cell {...c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={data.columns.length + 1} className="px-3 py-8 text-center text-black/45">{filter === 'dropped' ? 'No duplicates in this table.' : 'Nothing changed in this table.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {data && data.distributions.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.distributions.map((d) => (
            <Card key={d.column} className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <code className="font-mono text-[13px] font-semibold text-[#1d1d1f]">{d.column}</code>
                <Badge tone="red">{d.before.length} values before</Badge>
                <ArrowRight className="h-3.5 w-3.5 text-black/25" />
                <Badge tone="green">{d.after.length} after</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-black/35">Old</div>
                  <BarList data={d.before.map((x, i) => ({ label: `'${x.value}'`, value: x.count, tone: PALETTE[i % PALETTE.length] }))} />
                </div>
                <div>
                  <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-black/35">New</div>
                  <BarList data={d.after.map((x) => ({ label: x.value, value: x.count }))} color={theme.hex} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <Card>
          <CardHeader title="Column summary" subtitle="Filled values, missing-value tokens and distinct values, before and after" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-[12px]">
              <thead className="text-black/45">
                <tr className="border-b border-black/[0.07]">
                  <th className="px-2 py-2 text-left font-medium">column</th>
                  <th className="px-2 py-2 text-left font-medium">cleaning</th>
                  <th className="px-2 py-2 text-right font-medium">filled (old)</th>
                  <th className="px-2 py-2 text-right font-medium">&lsquo;N/A&rsquo;-style</th>
                  <th className="px-2 py-2 text-right font-medium">distinct old → new</th>
                  <th className="px-2 py-2 text-right font-medium">cells changed</th>
                  <th className="px-2 py-2 text-left font-medium">new range / total</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.map((s) => (
                  <tr key={s.column} className="border-b border-black/[0.05] hover:bg-[#f6f6f6]">
                    <td className="px-2 py-1.5 font-mono text-[#1d1d1f]">{s.column}</td>
                    <td className="px-2 py-1.5 text-black/60">{s.transform || <span className="text-black/35">kept</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.before.filled.toLocaleString()}</td>
                    <td className={cn('px-2 py-1.5 text-right tabular-nums', s.before.missingTokens && 'font-semibold text-amber-700')}>{s.before.missingTokens || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.before.distinct.toLocaleString()} → {s.after.distinct.toLocaleString()}</td>
                    <td className={cn('px-2 py-1.5 text-right tabular-nums', s.changedCells && 'font-semibold text-emerald-700')}>{s.changedCells || '—'}</td>
                    <td className="px-2 py-1.5 text-black/60">
                      {s.after.sum !== undefined ? `Σ ${fmt(s.after.sum)}` : ''}
                      {s.after.min !== undefined ? `${s.after.sum !== undefined ? ' · ' : ''}${fmt(s.after.min)} … ${fmt(s.after.max)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
