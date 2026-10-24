'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Columns2, Search, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Theme } from '../theme';
import { Badge, Card, Segmented, Skeleton, fmt } from '../ui';
import type { DatasetDetail, DatasetSummary, TableCompare } from '../useData';

type Mode = 'split' | 'raw' | 'clean';
type Filter = 'all' | 'changed' | 'dropped';
const PAGE = 25;

function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`); return j as T; })
      .then((data) => { if (alive) setState({ url, data, error: null }); })
      .catch((err) => { if (alive) setState({ url, data: null, error: err instanceof Error ? err.message : String(err) }); });
    return () => { alive = false; };
  }, [url]);
  return state.url === url ? state : { url, data: state.data, error: null, stale: true };
}

const show = (v: string | number | null, raw: boolean) => (v === null ? '∅' : raw ? (v === '' ? "''" : String(v)) : fmt(v));

export function ExplorerView({ dataset, detail, theme }: { dataset: DatasetSummary; detail: DatasetDetail | null; theme: Theme }) {
  const tables = detail?.tables ?? dataset.tables.map((t) => ({ name: t.name, rows: t.rows, columns: [] as DatasetDetail['tables'][number]['columns'], dedupe: undefined }));
  const [picked, setPicked] = useState<string | undefined>();
  const table = picked && tables.some((t) => t.name === picked) ? picked : [...tables].sort((a, b) => b.rows - a.rows)[0]?.name;
  const [mode, setMode] = useState<Mode>('split');
  const [filter, setFilter] = useState<Filter>('all');
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search); setOffset(0); }, 300); return () => clearTimeout(t); }, [search]);

  const meta = detail?.tables.find((t) => t.name === table);
  const cmpUrl = table ? `/api/datasets/${dataset.id}/compare?table=${encodeURIComponent(table)}&filter=${filter}&limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(q)}` : null;
  const cmp = useJson<TableCompare>(cmpUrl);
  const loading = !cmp.data && !cmp.error;
  const total = cmp.data?.matching ?? 0;
  const pick = (name: string) => { setPicked(name); setOffset(0); };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className={cn('grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br text-white transition-transform duration-500 hover:rotate-12 hover:scale-110', theme.gradient)}><Table2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold text-[#1d1d1f]">Data explorer</h2>
            <p className="text-[13px] text-black/60">
              Every row of <span className="font-medium">{dataset.name}</span>: the original values as stored next to what the agents read after cleaning. Your data is never changed.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full bg-[#f4f4f4] px-4 py-2">
            <span className="text-[12px] text-black/45">Clarity</span>
            <span className="text-[18px] font-semibold tabular-nums text-rose-600">{dataset.score}</span>
            <ArrowRight className="h-4 w-4 text-black/25" />
            <span className="text-[18px] font-semibold tabular-nums text-emerald-600">{detail?.after?.score ?? '…'}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tables.map((t) => (
            <button
              key={t.name}
              onClick={() => pick(t.name)}
              className={cn('rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97]', table === t.name ? cn(theme.border, theme.bgSoft, theme.text, 'shadow-sm') : 'border-black/[0.07] text-black/60 hover:-translate-y-px hover:border-black/20 hover:bg-[#f6f6f6]')}
            >
              <span className="font-mono">{t.name}</span>
              <span className="ml-1.5 text-black/35">{t.rows.toLocaleString()}</span>
              {t.dedupe?.removed ? <span className="ml-1.5 rounded bg-rose-100 px-1 text-[10.5px] text-rose-600">−{t.dedupe.removed}</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented
            value={mode}
            onChange={(m) => { setMode(m); setOffset(0); }}
            options={[
              { value: 'split', label: <span className="inline-flex items-center gap-1"><Columns2 className="h-3.5 w-3.5" /> Before | After</span> },
              { value: 'raw', label: 'Before (raw)' },
              { value: 'clean', label: 'After (cleaned)' },
            ]}
          />
          <Segmented value={filter} onChange={(f) => { setFilter(f); setOffset(0); }} options={[{ value: 'all', label: 'All rows' }, { value: 'changed', label: 'Changed' }, { value: 'dropped', label: 'Duplicates' }]} />
          <label className="ml-auto flex h-10 min-w-[220px] items-center gap-2 rounded-full bg-[#f4f4f4] px-4 text-[12.5px] transition-all focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(185,170,246,0.45)]">
            <Search className="h-3.5 w-3.5 text-black/35" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search values" className="w-full bg-transparent outline-none placeholder:text-black/35" />
          </label>
        </div>
      </Card>

      {cmp.data && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-black/60">
          <Badge tone="slate">{cmp.data.totals.rows.toLocaleString()} rows stored</Badge>
          <Badge tone="green">{(cmp.data.totals.rows - cmp.data.totals.droppedRows).toLocaleString()} rows after cleaning</Badge>
          <Badge tone="red">{cmp.data.totals.droppedRows} duplicates excluded</Badge>
          <Badge tone="amber">{cmp.data.totals.changedCells.toLocaleString()} cells corrected</Badge>
          <span className="ml-auto inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-200" /> dirty original</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" /> cleaned value</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-200" /> duplicate row</span>
          </span>
        </div>
      )}

      {cmp.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">{cmp.error}</div>}
      {loading && <Skeleton className="h-[420px]" />}

      {!loading && cmp.data && (
        mode === 'split' ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <Grid title="Before · raw, as stored" tone="raw" data={cmp.data} meta={meta} />
            <Grid title="After · what the agents read" tone="clean" data={cmp.data} meta={meta} />
          </div>
        ) : (
          <Grid title={mode === 'raw' ? 'Before · raw, as stored' : 'After · what the agents read'} tone={mode === 'raw' ? 'raw' : 'clean'} data={cmp.data} meta={meta} />
        )
      )}

      {!loading && (
        <div className="flex items-center justify-between text-[12.5px] text-black/60">
          <span>{total ? <>Rows <b>{offset + 1}</b>–<b>{Math.min(total, offset + PAGE)}</b> of <b>{total.toLocaleString()}</b>{q && <> matching &ldquo;{q}&rdquo;</>}</> : 'No matching rows.'}</span>
          <div className="flex items-center gap-1.5">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3.5 font-semibold transition-all hover:-translate-y-0.5 hover:bg-[#d6f26a] active:scale-95 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3.5 font-semibold transition-all hover:-translate-y-0.5 hover:bg-[#d6f26a] active:scale-95 disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function Grid({ title, tone, data, meta }: { title: string; tone: 'raw' | 'clean'; data: TableCompare; meta?: DatasetDetail['tables'][number] }) {
  const raw = tone === 'raw';
  return (
    <Card className="overflow-hidden">
      <div className={cn('flex items-center gap-2 border-b px-4 py-2.5', raw ? 'border-amber-100 bg-amber-50/50' : 'border-emerald-100 bg-emerald-50/50')}>
        <span className={cn('h-2 w-2 rounded-full', raw ? 'bg-amber-500' : 'bg-emerald-500')} />
        <span className="text-[13px] font-semibold text-[#1d1d1f]">{title}</span>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#f6f6f6] text-black/45">
            <tr>
              <th className="px-2.5 py-2 text-left font-medium">row</th>
              {data.columns.map((c) => {
                const col = meta?.columns.find((x) => x.name === c);
                return (
                  <th key={c} className="whitespace-nowrap px-2.5 py-2 text-left align-bottom font-medium" title={col?.transform || undefined}>
                    <div className="font-mono">{c}</div>
                    {!raw && col?.transform && <div className="mt-0.5 max-w-[160px] truncate text-[10px] font-normal text-emerald-600">{col.cleanType ?? 'cleaned'}</div>}
                    {raw && <div className="mt-0.5 text-[10px] font-normal text-black/35">{col?.type ?? ''}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => {
              const dropped = r.status === 'dropped';
              return (
                <tr key={r.id} className={cn('h-9 border-t border-black/[0.05] transition-colors', dropped ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-[#f6f6f6]')}>
                  <td className="whitespace-nowrap px-2.5 tabular-nums text-black/35">
                    {data.offset + i + 1}
                    {dropped && <Badge tone="red" className="ml-1.5">{raw ? 'duplicate' : 'excluded'}</Badge>}
                  </td>
                  {r.cells.map((c, j) => {
                    const v = raw ? c.raw : c.clean;
                    return (
                      <td
                        key={j}
                        title={c.changed ? `${show(c.raw, true)} → ${show(c.clean, false)}` : undefined}
                        className={cn(
                          'max-w-[200px] truncate whitespace-nowrap px-2.5 font-mono transition-colors',
                          dropped && !raw && 'text-black/25 line-through',
                          !dropped && c.changed && (raw ? 'bg-amber-100/70 text-amber-900' : 'bg-emerald-100/60 font-medium text-emerald-800'),
                          !c.changed && 'text-black/60',
                        )}
                      >
                        {v === null ? <span className={raw ? 'text-black/25' : 'italic text-black/35'}>{raw ? '∅' : 'missing'}</span> : show(v, raw)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!data.rows.length && <tr><td colSpan={data.columns.length + 1} className="px-3 py-10 text-center text-black/45">No rows match.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
