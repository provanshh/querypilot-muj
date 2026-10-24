'use client';

import { Activity, ArrowRight, ArrowUpRight, Ban, CheckCircle2, Clock, FileWarning, Lock, MessageSquareText, Percent, ShieldCheck, Sparkles, UploadCloud, XCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENTS } from '../agents';
import { LogoMark } from '../Logo';
import { Bubbles, ColumnPairs, DotMatrix, Sparkline } from '../charts';
import { THEME } from '../theme';
import { Badge, Button, Card, CardHeader, Skeleton } from '../ui';
import type { DatasetSummary, RunRow } from '../useData';
import { DatasetCard } from './DatasetsView';

const PROBLEMS = [
  {
    icon: FileWarning, tone: 'bg-rose-100 text-rose-600',
    title: 'Real databases are messy',
    body: 'Amounts stored as text with currency symbols, several date formats in one column, the same category spelled three ways, placeholders meaning missing, and duplicate rows.',
  },
  {
    icon: XCircle, tone: 'bg-amber-100 text-amber-700',
    title: 'Plain text-to-SQL breaks quietly',
    body: 'A one-shot query either crashes (SUM of text) or, worse, returns a confident wrong number: double-counted duplicates, split categories, missed months.',
  },
  {
    icon: ShieldCheck, tone: 'bg-[#d6f26a] text-[#1d1d1f]',
    title: 'Agents explore, clean, verify, or decline',
    body: 'Six agents map the schema, profile the values, write read-only SQL, check it independently, and decline when the data cannot support an answer.',
  },
];

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function datasetLabel(island: string, datasets: DatasetSummary[]) {
  return datasets.find((d) => d.id === island)?.name ?? island;
}

export function RunsTable({ runs, datasets, onOpen, limit }: { runs: RunRow[] | null; datasets: DatasetSummary[]; onOpen?: (r: RunRow) => void; limit?: number }) {
  if (!runs) return <div className="space-y-2 px-4 pb-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!runs.length) return <div className="px-5 pb-5 text-[12.5px] text-black/45">No runs yet. Ask a question to start.</div>;
  return (
    <div className="overflow-x-auto px-3 pb-3">
      <table className="w-full border-separate border-spacing-y-1 text-[12.5px]">
        <thead className="text-black/40">
          <tr><th className="px-3 py-1.5 text-left font-semibold">Question</th><th className="px-3 py-1.5 text-left font-semibold">Dataset</th><th className="px-3 py-1.5 text-left font-semibold">Result</th><th className="px-3 py-1.5 text-right font-semibold">When</th></tr>
        </thead>
        <tbody>
          {runs.slice(0, limit).map((r) => {
            const theme = THEME;
            return (
              <tr key={r.id} onClick={() => onOpen?.(r)} className={cn('group transition-all duration-200', onOpen && 'cursor-pointer')}>
                <td className="max-w-[340px] truncate rounded-l-full px-3 py-2.5 font-medium text-[#1d1d1f] transition-colors group-hover:bg-[#f4f4f4]" title={r.question}>{r.question}</td>
                <td className="px-3 py-2.5 transition-colors group-hover:bg-[#f4f4f4]"><span className={cn('inline-flex items-center gap-1.5', theme.text)}><theme.icon className="h-3.5 w-3.5" />{datasetLabel(r.island, datasets)}</span></td>
                <td className="px-3 py-2.5 transition-colors group-hover:bg-[#f4f4f4]">
                  {r.status === 'answered' ? <Badge tone="green" dot>Answered</Badge> : r.status === 'abstained' ? <Badge tone="amber" dot>Declined</Badge> : r.status === 'running' ? <Badge tone="violet" dot>Running</Badge> : <Badge tone="red" dot>{r.status}</Badge>}
                </td>
                <td className="whitespace-nowrap rounded-r-full px-3 py-2.5 text-right text-black/45 transition-colors group-hover:bg-[#f4f4f4]">
                  <span className="inline-flex items-center gap-1">{ago(r.started_at)}{onOpen && <ArrowUpRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ icon, title, children, className, onOpen, openLabel }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string; onOpen?: () => void; openLabel?: string }) {
  return (
    <Card className={cn('group p-5 hover:-translate-y-1', className)}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-black/[0.08] transition-all duration-300 group-hover:rotate-[-10deg] group-hover:border-transparent group-hover:bg-[#d6f26a]">{icon}</span>
        <span className="text-[14px] font-semibold">{title}</span>
        {onOpen && (
          <button
            onClick={onOpen} title={openLabel} aria-label={openLabel}
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-black/35 transition-all duration-300 hover:rotate-45 hover:bg-[#1d1d1f] hover:text-[#d6f26a] group-hover:text-black/70"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </Card>
  );
}

function Meter({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="group/m">
      <div className="flex items-end justify-between">
        <span className="text-[26px] font-medium leading-none tracking-tight">{Math.round(pct)}<span className="ml-0.5 text-[12px] text-black/40">%</span></span>
        <span className="flex items-center gap-1.5 text-[12px] text-black/55">{label}<span className="h-2 w-2 rounded-full" style={{ background: color }} /></span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="qp-bar h-full rounded-full transition-transform duration-300 group-hover/m:scale-y-125" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export function OverviewView({ datasets, activeId, runs, onOpen, onAsk, onAudit, onUpload, onOpenRun, onNavigate }: {
  datasets: DatasetSummary[] | null;
  activeId: string;
  runs: RunRow[] | null;
  onOpen: (id: string) => void;
  onAsk: () => void;
  onAudit: (id: string) => void;
  onUpload: () => void;
  onOpenRun: (r: RunRow) => void;
  onNavigate: (view: 'audit' | 'history' | 'datasets') => void;
}) {
  const all = datasets ?? [];
  const problems = all.reduce((s, d) => s + d.issues.high + d.issues.medium + d.issues.low, 0);
  const dupes = all.reduce((s, d) => s + d.duplicates, 0);
  const done = runs?.filter((r) => r.finished_at) ?? [];
  const answered = done.filter((r) => r.status === 'answered').length;
  const declined = done.filter((r) => r.status === 'abstained').length;
  const stopped = done.length - answered - declined;
  const pct = (n: number) => (done.length ? (n / done.length) * 100 : 0);
  const durations = done.slice(0, 20).reverse().map((r) => (Date.parse(r.finished_at!) - Date.parse(r.started_at)) / 1000);
  const avg = durations.length ? durations.reduce((s, x) => s + x, 0) / durations.length : 0;
  const clarity = all.length ? Math.round(all.reduce((s, d) => s + d.score, 0) / all.length) : 0;
  const columns = [...all.slice(0, 14).map((d) => ({ label: d.name, value: d.score, max: 100 }))];
  while (columns.length < 14) columns.push({ label: '', value: 0, max: 100 });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const buckets = days.map((d) => {
    const inDay = done.filter((r) => { const t = new Date(r.started_at); return t >= d && t.getTime() < d.getTime() + 86_400_000; });
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), a: inDay.filter((r) => r.status === 'answered').length, b: inDay.filter((r) => r.status !== 'answered').length };
  });
  const weekRuns = buckets.reduce((s, b) => s + b.a + b.b, 0);
  const weekOk = buckets.reduce((s, b) => s + b.a, 0);

  return (
    <div className="qp-stagger space-y-5">
      {/* Bento */}
      <div className="qp-stagger grid gap-4 lg:grid-cols-[1.05fr_1fr_1fr]">
        <Tile icon={<Zap className="h-4 w-4" />} title="Data problems found" className="lg:row-span-2" onOpen={() => onNavigate('audit')} openLabel="Open data health">
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-[38px] font-medium leading-none tracking-tight">{datasets ? problems.toLocaleString() : '…'}</span>
            <span className="text-[12px] text-black/45">across {all.length} dataset{all.length === 1 ? '' : 's'}</span>
            {dupes > 0 && <span className="-translate-y-3 rounded-full bg-[#d6f26a] px-2 py-0.5 text-[11px] font-bold">+{dupes} dupes</span>}
          </div>
          <div className="mt-4">
            <Bubbles items={[
              { label: 'Data problems found', value: problems, sub: 'problems' },
              { label: 'Duplicate rows caught', value: dupes, sub: 'duplicates' },
              { label: 'Questions answered', value: answered, sub: 'answered' },
            ]} />
          </div>
          <div className="mt-6 space-y-4">
            <Meter label="Answered" pct={pct(answered)} color="#b9aaf6" />
            <Meter label="Declined honestly" pct={pct(declined)} color="#1d1d1f" />
            <Meter label="Stopped or failed" pct={pct(stopped)} color="#d6f26a" />
          </div>
        </Tile>

        <div className="grid gap-4">
          <Tile icon={<CheckCircle2 className="h-4 w-4" />} title="Questions answered" onOpen={() => onNavigate('history')} openLabel="Open run history">
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[38px] font-medium leading-none tracking-tight">{runs ? answered : '…'}<span className="ml-1 text-[12px] font-normal text-black/40">verified</span></span>
              <span className="text-right text-[12px] leading-tight text-black/45">Declined<br /><span className="font-semibold text-[#1d1d1f]">{declined} honest no&apos;s</span></span>
            </div>
          </Tile>
          <Tile icon={<Clock className="h-4 w-4" />} title="Average run time" onOpen={() => onNavigate('history')} openLabel="Open run history">
            <div className="mt-4 flex items-end justify-between gap-3">
              <span className="text-[38px] font-medium leading-none tracking-tight">{runs ? avg.toFixed(1) : '…'}<span className="ml-1 text-[12px] font-normal text-black/40">sec</span></span>
              {durations.length > 1 ? <Sparkline values={durations} width={110} height={34} /> : <span className="text-right text-[12px] leading-tight text-black/45">Runs<br /><span className="font-semibold text-[#1d1d1f]">{done.length}</span></span>}
            </div>
          </Tile>
        </div>

        <Tile icon={<Percent className="h-4 w-4" />} title="Data clarity" onOpen={() => onNavigate('datasets')} openLabel="Open datasets">
          <div className="mt-4 flex items-baseline gap-1.5">
            <span className="text-[38px] font-medium leading-none tracking-tight">{datasets ? clarity : '…'}</span>
            <span className="text-[12px] text-black/40">/100</span>
            {all.length > 0 && <span className="-translate-y-3 rounded-full bg-[#d6f26a] px-2 py-0.5 text-[11px] font-bold">avg</span>}
          </div>
          <div className="mt-5">
            <DotMatrix columns={columns} title={(c) => (c.label ? `${c.label}: clarity ${c.value}/100` : 'No dataset')} />
          </div>
        </Tile>

        <div className="qp-card group overflow-hidden rounded-[26px] bg-[#1d1d1f] p-5 text-white hover:-translate-y-1 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-all duration-300 group-hover:rotate-[-10deg] group-hover:bg-[#d6f26a] group-hover:text-[#1d1d1f]"><Activity className="h-4 w-4" /></span>
            <span className="text-[14px] font-semibold">Agent activity</span>
            <span className="ml-auto rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold text-white/80">Last 7 days</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-8">
            <div className="flex items-stretch gap-2.5">
              <span className="w-1.5 rounded-full bg-[#d6f26a]" />
              <div>
                <div className="text-[34px] font-medium leading-none tracking-tight">{weekRuns ? Math.round((weekOk / weekRuns) * 100) : 0}<span className="ml-0.5 text-[12px] text-white/50">%</span></div>
                <div className="mt-1 text-[11.5px] text-white/50">Verified answer rate</div>
              </div>
            </div>
            <div className="flex items-stretch gap-2.5">
              <span className="w-1.5 rounded-full bg-[#b9aaf6]" />
              <div>
                <div className="text-[34px] font-medium leading-none tracking-tight">{weekRuns}<span className="ml-1 text-[12px] text-white/50">runs</span></div>
                <div className="mt-1 text-[11.5px] text-white/50">Questions and audits</div>
              </div>
            </div>
          </div>
          <div className="mt-4"><ColumnPairs buckets={buckets} highlight={6} /></div>
        </div>
      </div>

      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#d6f26a]/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-40 h-64 w-64 rounded-full bg-[#b9aaf6]/50 blur-3xl" />
        <div className="qp-logo-host absolute right-10 top-1/2 hidden -translate-y-1/2 xl:block">
          <div className="qp-float">
            <LogoMark size={150} variant="ink" className="rotate-[-8deg] drop-shadow-[0_30px_40px_rgba(29,29,31,0.35)] transition-transform duration-500 hover:rotate-0 hover:scale-105" />
          </div>
        </div>
        <div className="relative p-7 lg:p-9">
          <Badge tone="violet"><Sparkles className="h-3 w-3" /> Multi-agent data analyst</Badge>
          <h2 className="mt-4 max-w-3xl text-[30px] font-medium leading-[1.1] tracking-[-0.03em] lg:text-[40px]">
            Ask messy data in plain English. Get a <span className="rounded-2xl bg-[#d6f26a] px-2">verified answer</span>, or an honest no.
          </h2>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-black/55">
            Analysts shouldn&apos;t need to write SQL or know which columns hide text-typed numbers, placeholders and duplicate rows.
            QueryPilot&apos;s agents explore the data first, clean what they read, verify every number, and decline when no faithful query exists.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button size="lg" variant="primary" accent="rgba(124,108,240,0.8)" onClick={onAsk}><MessageSquareText className="h-4 w-4" /> Ask a question</Button>
            <Button size="lg" onClick={() => onAudit(activeId)}><ShieldCheck className="h-4 w-4" /> Audit data health</Button>
            <Button size="lg" variant="ghost" onClick={onUpload}><UploadCloud className="h-4 w-4" /> Upload a CSV</Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-black/50">
            <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Read-only transactions</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Every number verified</span>
            <span className="inline-flex items-center gap-1.5"><Ban className="h-3.5 w-3.5" /> Declines instead of guessing</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PROBLEMS.map((p, i) => (
          <Card key={p.title} className="group p-6 hover:-translate-y-1">
            <div className="flex items-center gap-2.5">
              <span className={cn('grid h-10 w-10 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6', p.tone)}><p.icon className="h-[18px] w-[18px]" /></span>
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/35">{['The problem', 'Why tools fail', 'Our approach'][i]}</span>
            </div>
            <h3 className="mt-4 text-[16px] font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-black/55">{p.body}</p>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between px-1">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">Your datasets</h2>
            <p className="text-[12.5px] text-black/45">Every CSV you upload, newest first.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {!datasets ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[260px] rounded-[26px]" />)
            : all.length ? all.map((d) => <DatasetCard key={d.id} d={d} active={d.id === activeId} onOpen={() => onOpen(d.id)} onAudit={() => onAudit(d.id)} />)
            : <div className="rounded-[26px] border-2 border-dashed border-black/10 px-5 py-8 text-center text-[12.5px] text-black/45 md:col-span-3">No datasets yet. Upload a CSV to get started.</div>}
        </div>
      </div>

      <Card>
        <CardHeader icon={<Sparkles className="h-4 w-4" />} title="The agents" subtitle="One orchestrated team. Every animation in the app is driven by an event one of them emitted." />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-6">
          {AGENTS.map((a, i) => (
            <div key={a.id} className="group relative rounded-[22px] bg-[#f5f5f5] p-4 transition-all duration-300 hover:-translate-y-1.5 hover:bg-white hover:shadow-[0_20px_40px_-20px_rgba(29,29,31,0.35)]">
              <span className="grid h-10 w-10 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-8deg]" style={{ background: `${a.color}1f`, color: a.color }}><a.icon className="h-[18px] w-[18px]" /></span>
              <div className="mt-3 text-[13px] font-semibold">{a.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-black/50">{a.role}</div>
              {i < AGENTS.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-black/25 lg:block" />}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Clock className="h-4 w-4" />} title="Recent runs" subtitle="Straight from the event log. Click one to replay it." />
        <RunsTable runs={runs} datasets={datasets ?? []} onOpen={onOpenRun} limit={7} />
      </Card>
    </div>
  );
}
