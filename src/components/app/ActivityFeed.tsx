'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Code2, Loader2, Wrench, XCircle } from 'lucide-react';
import type { AgentId, QuestEvent } from '@/lib/quest/types';
import { cn } from '@/lib/utils';
import { agentMeta } from './agents';

const TAG: Partial<Record<QuestEvent['type'], { label: string; cls: string }>> = {
  'data.issue_found': { label: 'Issue', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  'query.generated': { label: 'SQL', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  'query.execution_failed': { label: 'Error', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  'query.execution_succeeded': { label: 'Rows', cls: 'bg-[#f6f6f6] text-black/60 border-black/[0.07]' },
  'validation.check_passed': { label: 'Pass', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'validation.check_failed': { label: 'Reject', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  'validation.check_warned': { label: 'Caveat', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  'repair.requested': { label: 'Repair', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  'answer.approved': { label: 'Answer', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'answer.abstained': { label: 'Declined', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  'schema.table_discovered': { label: 'Table', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  'schema.relationship_discovered': { label: 'Link', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
};

function Icon({ e, live }: { e: QuestEvent; live: boolean }) {
  if (live) return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (e.type === 'validation.check_passed' || e.type === 'agent.task_succeeded' || e.type === 'answer.approved') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (e.type === 'validation.check_failed' || e.type === 'query.execution_failed' || e.type === 'agent.task_failed') return <XCircle className="h-3.5 w-3.5" />;
  if (e.type === 'data.issue_found' || e.type === 'validation.check_warned' || e.type === 'answer.abstained') return <AlertTriangle className="h-3.5 w-3.5" />;
  if (e.type === 'repair.requested') return <Wrench className="h-3.5 w-3.5" />;
  if (e.type === 'query.generated') return <Code2 className="h-3.5 w-3.5" />;
  const A = agentMeta(e.agent_id).icon;
  return <A className="h-3.5 w-3.5" />;
}

export function ActivityFeed({ events, running, filter, className, maxHeight = 420 }: { events: QuestEvent[]; running: boolean; filter?: AgentId | null; className?: string; maxHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const shown = events.filter((e) => e.type !== 'run.finished' && (!filter || e.agent_id === filter));
  const t0 = events[0] ? Date.parse(events[0].timestamp) : 0;

  useEffect(() => {
    const el = ref.current;
    if (el && running) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [shown.length, running]);

  return (
    <div ref={ref} className={cn('overflow-y-auto pr-1', className)} style={{ maxHeight }}>
      <ol className="relative">
        {shown.map((e, i) => {
          const a = agentMeta(e.agent_id);
          const live = running && i === shown.length - 1;
          const tag = TAG[e.type];
          const sql = typeof e.metadata?.sql === 'string' ? (e.metadata.sql as string) : null;
          const rows = Array.isArray(e.metadata?.rows) ? (e.metadata.rows as unknown[][]) : null;
          const cols = Array.isArray(e.metadata?.columns) ? (e.metadata.columns as string[]) : null;
          const expandable = !!(sql || (rows && cols));
          const isOpen = open === e.event_id;
          return (
            <li key={e.event_id} className="qp-feed-in relative pl-9 pb-3 last:pb-0">
              {i < shown.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-black/10" />}
              <span className="absolute left-0 top-0.5 grid h-[27px] w-[27px] place-items-center rounded-full border bg-white" style={{ color: a.color, borderColor: `${a.color}40` }}>
                <Icon e={e} live={live} />
              </span>
              <div
                className={cn('rounded-2xl px-2.5 py-1.5 transition-colors', expandable && 'cursor-pointer hover:bg-[#f6f6f6]', isOpen && 'bg-[#f6f6f6]')}
                onClick={() => expandable && setOpen(isOpen ? null : e.event_id)}
              >
                <div className="flex items-center gap-1.5 text-[11.5px]">
                  <span className="font-semibold" style={{ color: a.color }}>{a.title}</span>
                  {tag && <span className={cn('rounded-md border px-1.5 py-px text-[10.5px] font-medium', tag.cls)}>{tag.label}</span>}
                  <span className="ml-auto tabular-nums text-black/35">+{((Date.parse(e.timestamp) - t0) / 1000).toFixed(1)}s</span>
                  {expandable && <ChevronRight className={cn('h-3.5 w-3.5 text-black/35 transition-transform', isOpen && 'rotate-90')} />}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-black/70">{e.summary}</p>
                {isOpen && sql && (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[#1d1d1f] p-2.5 font-mono text-[11px] leading-relaxed text-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">{sql}</pre>
                )}
                {isOpen && rows && cols && (
                  <div className="mt-2 overflow-auto rounded-lg border border-black/[0.07] bg-white animate-in fade-in duration-200">
                    <table className="w-full text-[11px]">
                      <thead className="bg-[#f6f6f6] text-black/45"><tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
                      <tbody>{rows.map((r, ri) => <tr key={ri} className="border-t border-black/[0.05]">{r.map((v, ci) => <td key={ci} className="px-2 py-1 font-mono text-black/70">{v === null ? '∅' : String(v)}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
