'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Copy, FileSearch, Play, Radio, ShieldCheck, Sparkles, Wrench, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentFlow } from '../AgentFlow';
import { ActivityFeed } from '../ActivityFeed';
import { Gauge } from '../charts';
import type { Theme } from '../theme';
import { Badge, Button, Card, CardHeader, Kpi, Skeleton } from '../ui';
import type { DatasetDetail, DatasetSummary } from '../useData';
import type { Mission } from '../useMission';

const SEV = {
  high: { dot: 'bg-rose-500', label: 'High', tone: 'red' as const },
  medium: { dot: 'bg-amber-500', label: 'Medium', tone: 'amber' as const },
  low: { dot: 'bg-sky-500', label: 'Low', tone: 'sky' as const },
  info: { dot: 'bg-slate-400', label: 'Info', tone: 'slate' as const },
};

const ROLE_TONE: Record<string, 'slate' | 'violet' | 'blue' | 'green' | 'amber' | 'orange' | 'sky'> = {
  pk: 'slate', id: 'slate', measure: 'violet', category: 'blue', date: 'green', timestamp: 'green', period: 'green', email: 'sky', label: 'slate', text: 'slate', source: 'orange',
};

export function AuditView({ dataset, detail, theme, mission, onAudit, onCompare }: {
  dataset: DatasetSummary;
  detail: DatasetDetail | null;
  theme: Theme;
  mission: Mission;
  onAudit: () => void;
  onCompare: () => void;
}) {
  const isMine = mission.request?.dataset === dataset.id && mission.request.mode === 'audit';
  const running = isMine && mission.status === 'running';
  const [open, setOpen] = useState<string | null>(null);
  const [sev, setSev] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const issues = useMemo(() => (detail?.issues ?? []).filter((i) => i.severity !== 'info' && (sev === 'all' || i.severity === sev)), [detail, sev]);
  const fixes = detail?.tables.flatMap((t) => t.columns.filter((c) => c.transform).map((c) => ({ t: t.name, c }))) ?? [];
  const removed = detail?.tables.reduce((s, t) => s + (t.dedupe?.removed ?? 0), 0) ?? 0;
  const after = detail?.after;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex items-center gap-4">
            <Gauge score={dataset.score} label={`Before: ${dataset.grade}`} />
            <ArrowRight className="h-6 w-6 text-black/25" />
            {after ? <Gauge score={after.score} label={`After: ${after.grade}`} /> : <Skeleton className="h-[110px] w-[132px]" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-semibold text-[#1d1d1f]">Is {dataset.name} clear enough to analyse?</h2>
              <Badge tone={dataset.score >= 85 ? 'green' : dataset.score >= 60 ? 'amber' : 'red'} dot>{dataset.grade}</Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-black/60">
              The Quality Inspector profiles every column: it infers what each one means, then flags missing-value tokens, numbers stored as text, mixed formats, spelling variants and duplicate rows.
              The SQL Engineer turns each finding into a cleaning rule. The original tables are never changed; agents query a cleaned, read-only layer on top of them.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" accent={theme.hex} onClick={onAudit} disabled={running}>
                {running ? <Radio className="h-4 w-4 animate-pulse" /> : <Play className="h-4 w-4" />} {running ? 'Agents auditing…' : 'Run audit with agents'}
              </Button>
              <Button onClick={onCompare}><FileSearch className="h-4 w-4" /> Old vs new data</Button>
            </div>
          </div>
        </div>
      </Card>

      {isMine && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] animate-in fade-in duration-300">
          <Card>
            <CardHeader title="Audit workflow" subtitle={running ? 'Live' : 'Recorded run'} action={running ? <Badge tone="green" dot>Live</Badge> : mission.verdict ? <Badge tone="green">Complete</Badge> : null} />
            <div className="px-3 pb-3"><AgentFlow events={mission.events} running={running} compact /></div>
            {mission.verdict?.audit && <p className="border-t border-black/[0.05] px-5 py-3 text-[13px] text-black/70"><Sparkles className={cn('mr-1.5 inline h-4 w-4', theme.textSoft)} />{mission.verdict.answer}</p>}
          </Card>
          <Card><CardHeader title="Live activity" subtitle={`${mission.events.length} events`} /><div className="px-4 pb-4"><ActivityFeed events={mission.events} running={running} maxHeight={260} /></div></Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Problems found" value={detail ? detail.issues.filter((i) => i.severity !== 'info').length : '…'} sub={`${dataset.issues.high} high · ${dataset.issues.medium} medium · ${dataset.issues.low} low`} icon={<FileSearch className="h-4 w-4" />} accent="#e11d48" />
        <Kpi label="Columns cleaned" value={detail ? fixes.length : '…'} sub={detail ? `of ${detail.tables.reduce((s, t) => s + t.columns.length, 0)} columns` : ''} icon={<Wrench className="h-4 w-4" />} accent={theme.hex} />
        <Kpi label="Duplicate rows removed" value={detail ? removed : '…'} sub={detail?.tables.filter((t) => t.dedupe).map((t) => `${t.name}: ${t.dedupe!.removed}`).join(' · ') || 'none found'} icon={<Copy className="h-4 w-4" />} accent="#d97706" />
        <Kpi
          label="Problems left after cleaning"
          value={after ? after.remaining.filter((i) => i.severity !== 'info').length : '…'}
          sub="measured by re-profiling"
          icon={<ShieldCheck className="h-4 w-4" />} accent="#059669"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="What the Inspector found"
            subtitle="Every finding is computed from the actual values in the database"
            action={
              <div className="flex gap-1">
                {(['all', 'high', 'medium', 'low'] as const).map((s) => (
                  <button key={s} onClick={() => setSev(s)} className={cn('rounded-lg px-2 py-1 text-[11.5px] font-medium capitalize transition-colors', sev === s ? 'bg-[#1d1d1f] text-white' : 'text-black/45 hover:bg-black/[0.05]')}>{s}</button>
                ))}
              </div>
            }
          />
          <div className="max-h-[520px] space-y-1.5 overflow-y-auto px-4 pb-4">
            {!detail && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
            {issues.map((i) => (
              <div key={i.id} className="group rounded-[20px] bg-[#f6f6f6] p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_30px_-18px_rgba(29,29,31,0.35)]">
                <div className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEV[i.severity].dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-black/70">{i.table}{i.column ? `.${i.column}` : ''}</code>
                      <span className="text-[13px] font-medium text-[#1d1d1f]">{i.title}</span>
                    </div>
                    {i.examples.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {i.examples.map((e, k) => <code key={k} className="rounded-md border border-rose-100 bg-rose-50/60 px-1.5 py-0.5 font-mono text-[11px] text-rose-800">{e}</code>)}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-emerald-700">
                      <Wrench className="h-3.5 w-3.5" /> {i.fix}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {detail && !issues.length && <div className="rounded-2xl bg-emerald-50 p-4 text-[13px] text-emerald-800">No problems at this level.</div>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Cleaning plan" subtitle="What each column is, and the rule applied to it" />
            <div className="space-y-2 px-4 pb-4">
              {!detail && <Skeleton className="h-40" />}
              {detail?.tables.map((t) => {
                const isOpen = open === t.name;
                const changed = t.columns.filter((c) => c.transform).length;
                return (
                  <div key={t.name} className="overflow-hidden rounded-[20px] border border-black/[0.07] transition-shadow duration-300 hover:shadow-[0_14px_30px_-20px_rgba(29,29,31,0.3)]">
                    <button onClick={() => setOpen(isOpen ? null : t.name)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#f6f6f6]">
                      <code className="font-mono text-[12.5px] font-semibold text-[#1d1d1f]">{t.name}</code>
                      <span className="text-[11.5px] text-black/45">{t.rows.toLocaleString()} rows</span>
                      {changed > 0 && <Badge tone="violet">{changed} fixes</Badge>}
                      {t.dedupe && <Badge tone="amber">−{t.dedupe.removed} duplicates</Badge>}
                      {!changed && !t.dedupe && <Badge tone="green">clean</Badge>}
                      <ChevronDown className={cn('ml-auto h-4 w-4 text-black/35 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    {isOpen && (
                      <div className="border-t border-black/[0.05] animate-in fade-in slide-in-from-top-1 duration-200">
                        <table className="w-full text-[12px]">
                          <tbody>
                            {t.columns.map((c) => (
                              <tr key={c.name} className="border-t border-slate-50 first:border-0 hover:bg-[#f6f6f6]">
                                <td className="px-3 py-1.5 font-mono text-[#1d1d1f]">{c.name}</td>
                                <td className="px-2 py-1.5"><Badge tone={ROLE_TONE[c.role] ?? 'slate'}>{c.role}</Badge></td>
                                <td className="px-3 py-1.5 text-black/60">{c.transform || <span className="text-black/35">kept as is</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {t.dedupe && (
                          <div className="border-t border-black/[0.05] bg-amber-50/50 px-3 py-2 text-[12px] text-amber-900">
                            Duplicates: same {t.dedupe.keys.join(' + ')}{t.dedupe.preferred ? `; keep ${t.dedupe.sourceCol} = '${t.dedupe.preferred}'` : ''}{t.dedupe.orderCol ? `, latest ${t.dedupe.orderCol}` : ''}.
                          </div>
                        )}
                        <details className="border-t border-black/[0.05] px-3 py-2">
                          <summary className="cursor-pointer text-[12px] text-black/45 hover:text-[#1d1d1f]">Generated cleaning SQL</summary>
                          <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-[#1d1d1f] p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-100">{t.cleanSql}</pre>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
