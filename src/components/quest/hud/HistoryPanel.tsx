'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { IslandId } from '@/lib/quest/types';
import { isIsland, islandIds, islandMeta } from '@/lib/quest/islands';
import type { LiveState } from '../useLive';

interface RunRow {
  id: string;
  island: string;
  question: string;
  status: string;
  engine: string | null;
  started_at: string;
  finished_at: string | null;
  events: number;
}

/** City Hall archive: every mission ever run, plus the live wire of what's running now. */
export function HistoryPanel({ island, live, onReplay, onClose, busy }: {
  island: IslandId; live: LiveState; onReplay: (runId: string, island: IslandId) => void; onClose: () => void; busy: boolean;
}) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | IslandId>(island);

  const load = useCallback(() => {
    fetch('/api/runs?limit=60')
      .then((r) => r.json())
      .then((d: { runs?: RunRow[]; error?: string }) => { if (d.error) setError(d.error); else setRuns(d.runs ?? []); })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(load, [load]);
  const finishedCount = live.items.filter((i) => i.type === 'run.finished').length;
  useEffect(() => { if (finishedCount) load(); }, [finishedCount, load]);

  // Audits and datasets that are not on the map cannot be replayed here.
  const onIsland = (runs ?? []).flatMap((r) => (isIsland(r.island) && !r.question.startsWith('Audit ') ? [{ ...r, isl: r.island }] : []));
  const shown = onIsland.filter((r) => filter === 'all' || r.isl === filter);
  const active = Object.entries(live.active);

  return (
    <div className="qp-panel w-[380px] pointer-events-auto qp-rise flex flex-col max-h-[calc(100vh-180px)]">
      <div className="qp-header">
        <span className="text-amber-400">🏛</span> City Hall archive
        <button className="ml-auto qp-btn text-[9px] px-2 py-0.5" onClick={onClose}>Close</button>
      </div>
      <div className="px-3 py-2 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5 font-pixel text-[9px]">
          <span className={`w-2 h-2 rounded-full ${live.connected ? (live.pgListen ? 'bg-emerald-400 qp-blink' : 'bg-amber-400') : 'bg-red-500'}`} />
          <span className="text-slate-300">LIVE WIRE</span>
          <span className="text-slate-500">{live.connected ? (live.pgListen ? 'every tab, every surface' : 'this server only') : 'reconnecting…'}</span>
        </div>
        {active.length ? active.map(([id, a]) => {
          return (
            <div key={id} className="mt-1 text-[10px] font-mono text-slate-300 truncate">
              <span style={{ color: islandMeta(a.island).color }}>● </span>{a.question ?? id}: <span className="text-slate-400">{a.last}</span>
            </div>
          );
        }) : <div className="mt-1 text-[10px] font-mono text-slate-500">No missions running right now, in any tab.</div>}
      </div>
      <div className="flex gap-1 px-3 pt-2">
        {['all', ...islandIds()].map((f) => (
          <button key={f} className={`qp-btn text-[9px] px-2 py-0.5 ${filter === f ? '!bg-amber-500 !text-slate-900' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : islandMeta(f).short}</button>
        ))}
        <button className="qp-btn ml-auto text-[9px] px-2 py-0.5" onClick={load}>Refresh</button>
      </div>
      <div className="flex-1 overflow-y-auto qp-scroll px-3 py-2 space-y-1.5">
        {error && <div className="text-[11px] font-mono text-red-300">{error}</div>}
        {!runs && !error && <div className="text-[11px] font-mono text-slate-400 qp-blink">Opening the archive…</div>}
        {runs && !shown.length && <div className="text-[11px] font-mono text-slate-500">No missions on record yet.</div>}
        {shown.map((r) => (
          <div key={r.id} className="border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
            <div className="flex items-center gap-1.5 font-pixel text-[8px]">
              <span style={{ color: islandMeta(r.isl).color }}>{islandMeta(r.isl).short.toUpperCase()}</span>
              <span className={r.status === 'answered' ? 'text-emerald-300' : r.status === 'abstained' ? 'text-slate-300' : r.status === 'running' ? 'text-sky-300' : 'text-red-300'}>{r.status.toUpperCase()}</span>
              <span className="text-slate-500">{new Date(r.started_at).toLocaleTimeString()}</span>
              <span className="text-slate-500">{r.events} ev</span>
              <button className="qp-btn ml-auto text-[8px] px-1.5 py-0.5" disabled={busy || r.status === 'running'} onClick={() => onReplay(r.id, r.isl)}>Replay</button>
            </div>
            <div className="text-[10.5px] font-mono text-slate-200 mt-0.5 line-clamp-2">“{r.question}”</div>
          </div>
        ))}
      </div>
    </div>
  );
}
