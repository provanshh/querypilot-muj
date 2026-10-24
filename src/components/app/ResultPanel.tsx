'use client';

import { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, CircleSlash, Code2, Loader2, ShieldCheck, Target, Volume2, XCircle } from 'lucide-react';
import type { Verdict } from '@/lib/quest/types';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, fmt } from './ui';
import { BarList } from './charts';

function ResultTable({ columns, rows, max = 60 }: { columns: string[]; rows: (string | number | null)[][]; max?: number }) {
  return (
    <div className="overflow-auto rounded-2xl border border-black/[0.07] max-h-[320px]">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-[#f6f6f6] text-black/45">
          <tr>{columns.map((c) => <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap">{c.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-black/[0.05] transition-colors hover:bg-[#f3f0fe]">
              {r.map((v, j) => (
                <td key={j} className={cn('px-3 py-1.5 whitespace-nowrap', typeof v === 'number' ? 'tabular-nums text-right font-medium text-[#1d1d1f]' : 'text-black/70')}>
                  {v === null ? <span className="text-black/35">—</span> : fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckRow({ c }: { c: Verdict['checks'][number] }) {
  const Icon = c.status === 'pass' ? CheckCircle2 : c.status === 'fail' ? XCircle : c.status === 'warn' ? AlertTriangle : CircleSlash;
  const color = c.status === 'pass' ? 'text-emerald-600' : c.status === 'fail' ? 'text-rose-600' : c.status === 'warn' ? 'text-amber-600' : 'text-black/35';
  return (
    <li className="flex gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#f6f6f6]">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', color)} />
      <div className="text-[12.5px] leading-snug"><span className="font-medium text-[#1d1d1f]">{c.label}.</span> <span className="text-black/60">{c.detail}</span></div>
    </li>
  );
}

export function ResultPanel({ verdict, running, accent, onSpeak, question }: { verdict: Verdict | null; running: boolean; accent: string; onSpeak?: (text: string) => void; question?: string }) {
  const [showSql, setShowSql] = useState(false);

  if (!verdict) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3 text-black/45">
          {running ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: accent }} /> : <Target className="h-5 w-5" />}
          <div>
            <div className="text-[14px] font-semibold text-[#1d1d1f]">{running ? 'The agents are working…' : 'No answer yet'}</div>
            <div className="text-[12.5px]">{running ? (question ? `"${question}"` : 'Follow every step in the workflow above.') : 'Ask a question or pick a suggestion to see a verified answer here.'}</div>
          </div>
        </div>
      </Card>
    );
  }
  const answered = verdict.status === 'answered';
  const t = verdict.trust;
  const speakText = answered ? verdict.answer : `I can't answer that. ${verdict.reason ?? ''}`;

  return (
    <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={cn('m-2 flex flex-wrap items-center gap-2 rounded-[20px] px-4 py-3', answered ? 'bg-[#eef9c8]' : 'bg-amber-50')}>
        {answered ? <Badge tone="green" dot>Verified answer</Badge> : <Badge tone="amber" dot>Declined: no reliable answer</Badge>}
        {answered && <Badge tone="slate"><ShieldCheck className="h-3 w-3" /> {t.checksPassed} checks passed{t.checksWarned ? `, ${t.checksWarned} caveat${t.checksWarned === 1 ? '' : 's'}` : ''}</Badge>}
        {verdict.attempts.length > 1 && <Badge tone="violet">{verdict.attempts.length} drafts, {verdict.attempts.length - 1} rejected</Badge>}
        <span className="ml-auto text-[11.5px] text-black/45 tabular-nums">{(verdict.elapsedMs / 1000).toFixed(1)} s</span>
        {onSpeak && (
          <Button size="sm" variant="ghost" onClick={() => onSpeak(speakText)} title="Read the answer aloud">
            <Volume2 className="h-3.5 w-3.5" /> Listen
          </Button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div>
          <div className="text-[12px] font-medium uppercase tracking-wide text-black/35">{verdict.question}</div>
          <p className={cn('mt-1.5 text-[20px] leading-snug font-medium tracking-tight', answered ? 'text-[#1d1d1f]' : 'text-[#1d1d1f]')}>
            {answered ? verdict.answer : 'No answer. The agents found no faithful way to compute this.'}
          </p>
          {!answered && verdict.reason && (
            <div className="mt-3 flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
              <Ban className="mt-0.5 h-4 w-4 shrink-0" />
              <span><span className="font-semibold">Why: </span>{verdict.reason}</span>
            </div>
          )}
        </div>

        {answered && verdict.chart && verdict.chart.length > 1 && (
          <BarList data={verdict.chart.map((c) => ({ label: c.label, value: c.value, tone: c.value < 0 ? '#f43f5e' : undefined }))} color={accent} />
        )}
        {answered && verdict.rows.length > 0 && <ResultTable columns={verdict.columns} rows={verdict.rows} />}

        {verdict.checks.length > 0 && (
          <div>
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-black/35">How it was verified</div>
            <ul className="grid gap-0.5 md:grid-cols-2">{verdict.checks.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
          </div>
        )}

        {verdict.caveats.length > 0 && (
          <ul className="space-y-1 rounded-2xl bg-[#f6f6f6] px-3.5 py-2.5 text-[12.5px] text-black/60">
            {verdict.caveats.map((c) => <li key={c} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{c}</li>)}
          </ul>
        )}

        {verdict.attempts.length > 0 && (
          <div className="rounded-2xl border border-black/[0.07]">
            <button className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] font-medium text-black/70 hover:bg-[#f6f6f6] rounded-2xl" onClick={() => setShowSql((s) => !s)}>
              <Code2 className="h-4 w-4 text-violet-600" /> SQL drafts ({verdict.attempts.length})
              <span className="text-black/35 font-normal">{verdict.attempts.map((a) => (a.error ? '✗ crashed' : a.failedChecks.length ? '✗ rejected' : '✓ approved')).join(' → ')}</span>
              <ChevronDown className={cn('ml-auto h-4 w-4 text-black/35 transition-transform', showSql && 'rotate-180')} />
            </button>
            {showSql && (
              <div className="space-y-3 border-t border-black/[0.05] p-3.5 animate-in fade-in duration-200">
                {verdict.attempts.map((a) => (
                  <div key={a.attempt}>
                    <div className="mb-1 flex items-center gap-2 text-[12px]">
                      <span className="font-semibold text-[#1d1d1f]">Draft {a.attempt}</span>
                      {a.error ? <Badge tone="red">crashed</Badge> : a.failedChecks.length ? <Badge tone="red">rejected: {a.failedChecks.join(', ').replace(/_/g, ' ')}</Badge> : <Badge tone="green">approved</Badge>}
                      {a.attempt > 1 && verdict.mode === 'ask' && <span className="text-black/45">runs on the cleaning layer</span>}
                    </div>
                    {a.error && <div className="mb-1 rounded-md bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-700">{a.error}</div>}
                    <pre className="max-h-60 overflow-auto rounded-lg bg-[#1d1d1f] p-3 font-mono text-[11.5px] leading-relaxed text-slate-100">{a.sql}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {answered && verdict.rowCount > 0 && <div className="text-[11.5px] text-black/35">{fmt(verdict.rowCount)} row{verdict.rowCount === 1 ? '' : 's'} · read-only transaction · no data was modified</div>}
      </div>
    </Card>
  );
}
