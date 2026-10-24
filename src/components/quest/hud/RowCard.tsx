'use client';

import React, { useEffect, useState } from 'react';
import type { IslandId } from '@/lib/quest/types';
import { islandMeta } from '@/lib/quest/islands';

interface RowsResponse {
  table: string;
  description?: string;
  rowCount: number;
  offset: number;
  columns: { name: string; type: string; description?: string }[];
  rows: unknown[][];
  flags: (string | null)[][];
  error?: string;
}

/** A house = a row. Shows the real stored values for the rows this house stands for, with traps highlighted. */
export function RowCard({ island, table, offset, kind, onClose, onOpenTable }: {
  island: IslandId; table: string; offset: number; kind: string; onClose: () => void; onOpenTable: () => void;
}) {
  const [data, setData] = useState<RowsResponse | null>(null);
  const [page, setPage] = useState(offset);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/islands/${island}/rows?table=${encodeURIComponent(table)}&offset=${page}&limit=3`)
      .then((r) => r.json())
      .then((d: RowsResponse) => {
        if (!alive) return;
        if (d.error) setError(d.error); else { setData(d); setError(null); }
      })
      .catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, [island, table, page]);

  const dirty = data?.flags.flat().filter(Boolean).length ?? 0;
  const last = data ? Math.max(0, data.rowCount - 3) : 0;

  return (
    <div className="qp-panel w-[380px] pointer-events-auto qp-rise">
      <div className="qp-header">
        <span style={{ color: islandMeta(island).color }}>⌂</span>
        <span className="truncate">{kind.replace(/_/g, ' ')} · rows of {table}</span>
        <button className="ml-auto qp-btn text-[9px] px-2 py-0.5" onClick={onClose}>Close</button>
      </div>
      <div className="px-3 pt-2 pb-3">
        <div className="text-[10.5px] font-mono text-slate-300 leading-snug">
          Every house in this neighbourhood is a record in <span className="text-amber-300">{table}</span>
          {data?.description ? <> — {data.description.toLowerCase()}</> : null}. These are the real values stored in {islandMeta(island).name}:
        </div>
        {error && <div className="mt-2 text-[11px] font-mono text-red-300">{error}</div>}
        {!data && !error && <div className="mt-3 text-[11px] font-mono text-slate-400 qp-blink">Knocking on the door…</div>}
        {data && (
          <div className="mt-2 space-y-2">
            {data.rows.map((r, ri) => (
              <div key={ri} className="border border-slate-700 bg-slate-950/60">
                <div className="px-2 py-0.5 font-pixel text-[8px] text-slate-400 border-b border-slate-800">ROW {data.offset + ri + 1} / {data.rowCount}</div>
                <div className="grid grid-cols-[110px_1fr] text-[10.5px] font-mono">
                  {data.columns.map((c, ci) => {
                    const flag = data.flags[ri]?.[ci];
                    const v = r[ci];
                    return (
                      <React.Fragment key={c.name}>
                        <div className="px-2 py-[2px] text-slate-400 truncate" title={c.description ?? 'undocumented column'}>
                          {c.name}{!c.description && <span className="text-amber-500">*</span>}
                        </div>
                        <div className={`px-2 py-[2px] truncate ${flag ? 'bg-red-950/70 text-red-200' : 'text-slate-100'}`} title={flag ?? undefined}>
                          {v === null ? <span className="text-slate-500 italic">NULL</span> : v === '' ? <span className="text-red-300">&apos;&apos; (empty)</span> : JSON.stringify(v).replace(/^"|"$/g, '')}
                          {flag && <span className="ml-1.5 text-[9px] text-red-300">⚠ {flag}</span>}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <button className="qp-btn text-[9px] px-2 py-0.5" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 3))}>◀ Prev</button>
              <button className="qp-btn text-[9px] px-2 py-0.5" disabled={page >= last} onClick={() => setPage(Math.min(last, page + 3))}>Next ▶</button>
              <span className="text-[9.5px] font-mono text-slate-400 ml-1">{dirty ? <span className="text-red-300">{dirty} trap value{dirty > 1 ? 's' : ''} on this street</span> : 'No traps on this street'}</span>
              <button className="qp-btn ml-auto text-[9px] px-2 py-0.5" onClick={onOpenTable}>Table dossier</button>
            </div>
            <div className="text-[9px] font-mono text-slate-500"><span className="text-amber-500">*</span> undocumented column — the crew has to infer its meaning.</div>
          </div>
        )}
      </div>
    </div>
  );
}
