'use client';

import React, { useState } from 'react';
import type { CrewReportEntry, Verdict } from '@/lib/quest/types';
import { CREW_BY_ID } from '@/lib/quest/crew';
import { isIsland, islandMeta } from '@/lib/quest/islands';
import { Portrait } from './Panels';

type Tab = 'answer' | 'crew' | 'evidence' | 'sql' | 'notes';

export function VerdictScreen({ verdict, xp, onClose, onReplay, canReplay, onNew }: {
  verdict: Verdict; xp: number; onClose: () => void; onReplay: () => void; canReplay: boolean; onNew: () => void;
}) {
  const [tab, setTab] = useState<Tab>(verdict.status === 'answered' ? 'answer' : 'crew');
  const solved = verdict.status === 'answered';
  const max = verdict.chart?.length ? Math.max(...verdict.chart.map((c) => Math.abs(c.value)), 1e-9) : 1;
  const repairs = Math.max(0, verdict.attempts.length - 1);
  const refused = !solved && !verdict.attempts.length;
  const id = verdict.dataset ?? verdict.island;
  const isl = isIsland(id) ? id : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] pointer-events-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qp-panel w-[min(860px,94vw)] max-h-[88vh] flex flex-col qp-rise">
        <div className={`relative px-5 pt-4 pb-3 border-b ${solved ? 'border-emerald-600/60' : 'border-slate-600'}`}>
          <div className="flex items-start gap-4">
            <Portrait id="analyst" size={64} ring={solved ? '#10b981' : '#94a3b8'} />
            <div className="flex-1 min-w-0">
              <div className="font-pixel text-[9px] text-slate-400">
                <span style={{ color: isl ? islandMeta(isl).color : undefined }}>{isl ? islandMeta(isl).name.toUpperCase() : 'CASE'}</span> · CASE FILE · {(verdict.elapsedMs / 1000).toFixed(1)}s</div>
              <div className={`font-pixel text-[26px] leading-tight ${solved ? 'text-emerald-300' : 'text-slate-200'}`}>{solved ? 'CASE SOLVED' : 'NO ANSWER'}</div>
              <div className="text-[11.5px] font-mono text-amber-200/90 mt-0.5">“{verdict.question}”</div>
            </div>
            <div className={`qp-stamp font-pixel text-[13px] px-3 py-1.5 border-[3px] rotate-[-8deg] ${solved ? 'border-emerald-400 text-emerald-300' : 'border-slate-300 text-slate-200'}`}>
              {solved ? 'VERIFIED' : 'ABSTAINED'}
            </div>
          </div>
          <div className="mt-3 text-[13px] font-mono text-white leading-relaxed">{verdict.answer}</div>
          {verdict.reason && <div className="mt-1 text-[11px] font-mono text-slate-400">{verdict.reason}</div>}
          <div className="mt-3 flex flex-wrap gap-1.5 font-pixel text-[8.5px]">
            <Badge ok={verdict.trust.schemaMapped}>SCHEMA MAPPED</Badge>
            <Badge ok={verdict.trust.executed} neutral={refused}>{refused ? 'NO SQL NEEDED' : 'EXECUTED'}</Badge>
            <Badge ok={verdict.trust.checksFailed === 0 && verdict.trust.checksPassed > 0} neutral={refused}>{verdict.trust.checksPassed} PASS · {verdict.trust.checksFailed} FAIL · {verdict.trust.checksWarned} WARN</Badge>
            <Badge ok={verdict.trust.independentlyVerified} neutral={refused || !verdict.checks.some((c) => c.id === 'spot' && c.status !== 'skip')}>INDEPENDENT RECOMPUTE</Badge>
            <Badge ok={repairs > 0} neutral={repairs === 0}>{repairs} REPAIR{repairs === 1 ? '' : 'S'}</Badge>
            {xp > 0 && <span className="ml-auto px-2 py-0.5 bg-amber-500 text-slate-900">+{xp} XP</span>}
          </div>
        </div>

        <div className="flex gap-1 px-5 pt-2">
          {(['answer', 'crew', 'evidence', 'sql', 'notes'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`qp-btn text-[9px] px-3 py-1 ${tab === t ? '!bg-amber-500 !text-slate-900 !border-amber-300' : ''}`}>
              {t === 'answer' ? `Rows (${verdict.rowCount})` : t === 'crew' ? 'Who did what' : t === 'evidence' ? `Evidence (${verdict.checks.length})` : t === 'sql' ? `SQL (${verdict.attempts.length})` : 'Caveats'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto qp-scroll px-5 py-3 min-h-[180px]">
          {tab === 'answer' && (
            verdict.rows.length ? (
              <div className="space-y-3">
                {verdict.chart && verdict.chart.length > 0 && (
                  <div className="space-y-1">
                    {verdict.chart.slice(0, 10).map((c) => (
                      <div key={c.label} className="flex items-center gap-2 text-[10.5px] font-mono">
                        <span className="w-40 truncate text-slate-300" title={c.label}>{c.label}</span>
                        <div className="flex-1 h-3 bg-slate-800 relative">
                          <div className={`h-full ${c.value < 0 ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${(Math.abs(c.value) / max) * 100}%` }} />
                        </div>
                        <span className={`w-16 text-right ${c.value < 0 ? 'text-red-300' : 'text-amber-200'}`}>{fmt(c.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <table className="w-full text-[10.5px] font-mono">
                  <thead>
                    <tr>{verdict.columns.map((c) => <th key={c} className="text-left px-2 py-1 font-pixel text-[8px] text-slate-400 border-b border-slate-700">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {verdict.rows.slice(0, 60).map((r, i) => (
                      <tr key={i} className="border-b border-slate-800/80">
                        {r.map((v, j) => <td key={j} className="px-2 py-0.5 text-slate-200 whitespace-nowrap">{v === null ? <span className="text-slate-600">null</span> : typeof v === 'number' ? fmt(v) : v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {verdict.rowCount > 60 && <div className="text-[10px] font-mono text-slate-500">Showing 60 of {verdict.rowCount} rows.</div>}
              </div>
            ) : <div className="text-[11px] font-mono text-slate-400">No rows — the crew did not certify a result set.</div>
          )}
          {tab === 'crew' && <CrewReport crew={verdict.crew ?? []} />}
          {tab === 'evidence' && (
            <div className="space-y-1.5">
              {!verdict.checks.length && <div className="text-[11px] font-mono text-slate-400">No checks were run — the question was refused before any SQL was written.</div>}
              {verdict.checks.map((c) => (
                <div key={c.id} className="flex gap-2 items-start text-[11px] font-mono">
                  <span className={`shrink-0 w-12 text-center font-pixel text-[8px] py-0.5 ${c.status === 'pass' ? 'bg-emerald-500 text-slate-900' : c.status === 'fail' ? 'bg-red-500 text-white' : c.status === 'warn' ? 'bg-yellow-500 text-slate-900' : 'bg-slate-600 text-white'}`}>{c.status.toUpperCase()}</span>
                  <div><div className="text-slate-100">{c.label}</div><div className="text-slate-400 text-[10.5px]">{c.detail}</div></div>
                </div>
              ))}
            </div>
          )}
          {tab === 'sql' && (
            <div className="space-y-3">
              {verdict.attempts.map((a) => (
                <div key={a.attempt} className="border border-slate-700">
                  <div className="flex items-center gap-2 px-2 py-1 bg-slate-900 font-pixel text-[8.5px]">
                    <span className="text-amber-300">DRAFT #{a.attempt}</span>
                    {a.error ? <span className="text-red-300">ERROR</span> : <span className="text-slate-400">{a.rowCount ?? 0} rows · {a.durationMs ?? 0}ms</span>}
                    {a.failedChecks.length > 0
                      ? <span className="ml-auto text-red-300">FAILED: {a.failedChecks.join(', ')}</span>
                      : <span className="ml-auto text-emerald-300">ALL CHECKS PASSED</span>}
                  </div>
                  <pre className="text-[10px] leading-snug font-mono text-slate-200 p-2 whitespace-pre-wrap">{a.sql}</pre>
                  {a.error && <div className="px-2 pb-2 text-[10px] font-mono text-red-300">{a.error}</div>}
                </div>
              ))}
              {!verdict.attempts.length && <div className="text-[11px] font-mono text-slate-400">No SQL was executed.</div>}
            </div>
          )}
          {tab === 'notes' && (
            <div className="space-y-3 text-[11px] font-mono">
              <div>
                <div className="font-pixel text-[9px] text-slate-400 mb-1">ASSUMPTIONS</div>
                {verdict.assumptions.length ? verdict.assumptions.map((a, i) => <div key={i} className="text-slate-200">• {a}</div>) : <div className="text-slate-500">None.</div>}
              </div>
              <div>
                <div className="font-pixel text-[9px] text-slate-400 mb-1">CAVEATS</div>
                {verdict.caveats.length ? verdict.caveats.map((a, i) => <div key={i} className="text-amber-200">• {a}</div>) : <div className="text-slate-500">None.</div>}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-slate-700/60">
          <button className="qp-btn text-[10px] px-3 py-1.5" onClick={onReplay} disabled={!canReplay}>Replay <span className="qp-key ml-1">R</span></button>
          <button className="qp-btn text-[10px] px-3 py-1.5" onClick={onClose}>Back to city <span className="qp-key ml-1">Esc</span></button>
          <button className="qp-btn qp-btn-primary text-[10px] px-3 py-1.5 ml-auto" onClick={onNew}>New order <span className="qp-key ml-1 !bg-amber-200 !text-slate-900">⏎</span></button>
        </div>
      </div>
    </div>
  );
}

const STAT_LABEL: Record<string, string> = {
  approvals: 'permits', tables: 'tables', roads: 'links', issues: 'issues', drafts: 'drafts', errors: 'crashes', runs: 'runs',
  attempts: 'attempts', passed: 'passed', failed: 'failed', warned: 'warned', repairs: 'repairs', verdicts: 'verdicts',
};

function CrewReport({ crew }: { crew: CrewReportEntry[] }) {
  if (!crew.length) return <div className="text-[11px] font-mono text-slate-400">No crew report recorded for this mission.</div>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {crew.map((c) => {
        const m = CREW_BY_ID[c.agent];
        return (
          <div key={c.agent} className={`border p-2 bg-slate-900/60 ${c.outcome === 'failed' ? 'border-red-600/70' : c.outcome === 'idle' ? 'border-slate-700 opacity-70' : 'border-slate-600'}`}>
            <div className="flex items-center gap-2">
              <Portrait id={c.agent} size={30} ring={m.color} />
              <div className="min-w-0">
                <div className="font-pixel text-[9px]" style={{ color: m.color }}>{m.name}</div>
                <div className="font-pixel text-[7.5px] text-slate-400">{m.role} · {c.outcome === 'idle' ? 'NOT NEEDED' : c.outcome === 'failed' ? 'GAVE UP' : 'DONE'} · {(c.activeMs / 1000).toFixed(1)}s</div>
              </div>
              <div className="ml-auto flex flex-wrap justify-end gap-1 max-w-[50%]">
                {Object.entries(c.stats).filter(([, v]) => v > 0).map(([k, v]) => (
                  <span key={k} className={`font-pixel text-[7.5px] px-1 py-px border ${k === 'failed' || k === 'errors' ? 'border-red-600 text-red-300' : k === 'issues' ? 'border-orange-600 text-orange-300' : 'border-slate-600 text-slate-300'}`}>{v} {STAT_LABEL[k] ?? k}</span>
                ))}
              </div>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {c.highlights.length ? c.highlights.map((h, i) => <div key={i} className="text-[10px] font-mono text-slate-300 leading-snug line-clamp-2">• {h}</div>)
                : <div className="text-[10px] font-mono text-slate-500">Stayed at City Hall — this mission didn&apos;t need them.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ ok, neutral, children }: { ok: boolean; neutral?: boolean; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-0.5 border ${neutral ? 'border-slate-600 text-slate-300' : ok ? 'border-emerald-500 text-emerald-300' : 'border-red-500 text-red-300'}`}>
      {neutral ? '·' : ok ? '✓' : '✗'} {children}
    </span>
  );
}

function fmt(v: number) {
  if (Number.isInteger(v)) return v.toLocaleString();
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(2);
}
