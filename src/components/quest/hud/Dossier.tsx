'use client';

import React from 'react';
import type { WorldSchema } from '@/lib/quest/types';
import type { TableMark } from '../useQuest';

export function TableDossier({ schema, table, mark, onClose }: {
  schema: WorldSchema; table: string; mark?: TableMark; onClose: () => void;
}) {
  const t = schema.tables.find((x) => x.name === table);
  if (!t) return null;
  const rels = schema.relationships.filter((r) => r.fromTable === table || r.toTable === table);
  const undocumented = t.columns.filter((c) => !c.description && !c.pk);
  return (
    <div className="qp-panel w-[380px] pointer-events-auto qp-rise flex flex-col max-h-[calc(100vh-340px)]">
      <div className="qp-header">
        <span className="text-amber-400">▣</span> District dossier
        <button className="ml-auto qp-btn text-[9px] px-2 py-0.5" onClick={onClose}>Close <span className="qp-key ml-1">Esc</span></button>
      </div>
      <div className="px-3 pt-2 pb-2 border-b border-slate-700/60">
        <div className="flex items-baseline gap-2">
          <span className="font-pixel text-[15px] text-white">{t.name}</span>
          <span className="font-pixel text-[9px] text-slate-400">{t.rowCount} ROWS · {t.columns.length} COLS</span>
          {mark?.certified && <span className="ml-auto font-pixel text-[8px] px-1.5 py-0.5 bg-emerald-500 text-slate-900">VERIFIED</span>}
        </div>
        <div className="text-[11px] font-mono text-slate-300 mt-1">{t.description ?? <span className="text-amber-300">No documentation for this table.</span>}</div>
        {undocumented.length > 0 && (
          <div className="text-[10px] font-mono text-amber-300/90 mt-1">⚠ Undocumented: {undocumented.map((c) => c.name).join(', ')}</div>
        )}
      </div>
      <div className="overflow-y-auto qp-scroll flex-1">
        <table className="w-full text-[10.5px] font-mono">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="text-left font-pixel text-[8px] text-slate-400">
              <th className="px-3 py-1">COLUMN</th><th className="px-1 py-1">TYPE</th><th className="px-2 py-1">MEANING / SAMPLES</th>
            </tr>
          </thead>
          <tbody>
            {t.columns.map((c) => (
              <tr key={c.name} className="border-t border-slate-800 align-top">
                <td className="px-3 py-1 text-slate-100 whitespace-nowrap">
                  {c.pk && <span className="text-amber-400 mr-1" title="Primary key">⚿</span>}
                  {c.fk && <span className="text-cyan-400 mr-1" title={`→ ${c.fk.table}.${c.fk.column}`}>⇢</span>}
                  {c.name}
                </td>
                <td className="px-1 py-1 text-slate-400">{c.type || '—'}</td>
                <td className="px-2 py-1">
                  <div className={c.description ? 'text-slate-300' : 'text-amber-300/80 italic'}>{c.description ?? 'undocumented'}</div>
                  <div className="text-slate-500 truncate max-w-[220px]" title={c.samples.join(' | ')}>
                    {c.samples.map((s) => (s === '' ? '∅' : s)).join(' · ')}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rels.length > 0 && (
          <div className="px-3 py-2 border-t border-slate-700/60">
            <div className="font-pixel text-[8px] text-slate-400 mb-1">ROADS (FOREIGN KEYS)</div>
            {rels.map((r) => (
              <div key={r.id} className="text-[10.5px] font-mono text-cyan-200">{r.fromTable}.{r.fromColumn} → {r.toTable}.{r.toColumn}</div>
            ))}
          </div>
        )}
        {mark?.issues.length ? (
          <div className="px-3 py-2 border-t border-slate-700/60">
            <div className="font-pixel text-[8px] text-red-300 mb-1">INSPECTOR&apos;S ALERTS (THIS MISSION)</div>
            {mark.issues.map((i, k) => (
              <div key={k} className="text-[10.5px] font-mono text-red-200 leading-snug">• {i}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
