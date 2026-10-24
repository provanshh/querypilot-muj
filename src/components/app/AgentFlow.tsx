'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle, CircleDashed } from 'lucide-react';
import type { AgentId, QuestEvent } from '@/lib/quest/types';
import { cn } from '@/lib/utils';
import { AGENTS, agentStates, type AgentState } from './agents';

const POS: Record<AgentId, { x: number; y: number }> = {
  mayor: { x: 0, y: 0.5 },
  scout: { x: 0.25, y: 0.5 },
  inspector: { x: 0.5, y: 0 },
  engineer: { x: 0.5, y: 1 },
  verifier: { x: 0.75, y: 0.5 },
  analyst: { x: 1, y: 0.5 },
};
const EDGES: [AgentId, AgentId][] = [['mayor', 'scout'], ['scout', 'inspector'], ['scout', 'engineer'], ['inspector', 'verifier'], ['engineer', 'verifier'], ['verifier', 'analyst']];

const STATE_LABEL: Record<AgentState, string> = { idle: 'Waiting', working: 'Working', done: 'Done', failed: 'Stopped' };

export function AgentFlow({ events, running, selected, onSelect, compact }: {
  events: QuestEvent[];
  running: boolean;
  selected?: AgentId | null;
  onSelect?: (id: AgentId | null) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: compact ? 240 : 300 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const states = useMemo(() => agentStates(events, running), [events, running]);
  const repaired = events.some((e) => e.type === 'repair.requested');
  const repairing = running && events.at(-1)?.type === 'repair.requested';
  const padX = 78;
  const padY = compact ? 36 : 58;
  const p = (id: AgentId) => ({
    x: padX + POS[id].x * (size.w - padX * 2),
    y: padY + POS[id].y * (size.h - padY * 2),
  });
  const curve = (a: AgentId, b: AgentId, bend = 0) => {
    const s = p(a);
    const t = p(b);
    const dx = (t.x - s.x) * 0.5;
    return `M ${s.x} ${s.y + bend} C ${s.x + dx} ${s.y + bend}, ${t.x - dx} ${t.y + bend}, ${t.x} ${t.y + bend}`;
  };

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <div ref={ref} className={cn('relative min-w-[760px]', compact ? 'h-[250px]' : 'h-[330px]')}>
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <pattern id="qp-dots" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="#e7e3fb" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#qp-dots)" />
          {EDGES.map(([a, b]) => {
            const sa = states[a].state;
            const sb = states[b].state;
            const active = running && sa !== 'idle' && sb === 'working';
            const done = sa === 'done' && sb !== 'idle';
            const color = AGENTS.find((x) => x.id === b)!.color;
            const d = curve(a, b);
            return (
              <g key={`${a}-${b}`}>
                <path d={d} fill="none" stroke={active ? color : done ? '#94a3b8' : '#e2e8f0'} strokeWidth={active ? 2.5 : 2} className={cn(active && 'qp-flow', !active && !done && 'qp-idle-edge')} />
                {active && (
                  <circle r="4.5" fill={color}>
                    <animateMotion dur="1.1s" repeatCount="indefinite" path={d} />
                  </circle>
                )}
              </g>
            );
          })}
          {repaired && (() => {
            const v = p('verifier');
            const e = p('engineer');
            const d = `M ${v.x - 20} ${v.y + 30} Q ${(v.x + e.x) / 2 + 30} ${e.y + 10}, ${e.x + 70} ${e.y - 4}`;
            return (
              <g>
                <path d={d} fill="none" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 5" className={cn(repairing && 'qp-flow')} markerEnd="" />
                <text x={(v.x + e.x) / 2 + 34} y={(v.y + e.y) / 2 + 26} fontSize="11" fill="#e11d48" fontWeight={600}>repair</text>
              </g>
            );
          })()}
        </svg>
        {AGENTS.map((a) => {
          const s = states[a.id];
          const pos = p(a.id);
          const Icon = a.icon;
          const isSel = selected === a.id;
          return (
            <button
              key={a.id}
              onClick={() => onSelect?.(isSel ? null : a.id)}
              className={cn(
                'group absolute w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border bg-white px-3 py-2.5 text-left transition-all duration-300 ease-out',
                'hover:-translate-y-[calc(50%+5px)] hover:shadow-[0_20px_36px_-16px_rgba(29,29,31,0.35)] active:scale-[0.98]',
                s.state === 'working' ? 'shadow-[0_14px_30px_-14px_rgba(124,108,240,0.55)]' : s.state === 'done' ? 'shadow-[0_1px_2px_rgba(29,29,31,0.05)]' : 'shadow-none',
                isSel ? 'ring-2 ring-offset-2' : '',
              )}
              style={{ left: pos.x, top: pos.y, borderColor: s.state === 'idle' ? 'rgba(29,29,31,0.07)' : `${a.color}66`, ['--tw-ring-color' as string]: a.color }}
            >
              {s.state === 'working' && <span className="pointer-events-none absolute -inset-[3px] rounded-[22px] border-2 opacity-60 animate-[qp-glow_1.6s_ease-in-out_infinite]" style={{ borderColor: a.color }} />}
              <div className="flex items-center gap-2">
                <span className={cn('relative grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6', a.soft)} style={{ color: a.color }}>
                  <Icon className="h-4 w-4" />
                  {s.state === 'working' && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white animate-pulse" style={{ background: a.color }} />}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-[#1d1d1f]">{a.title}</div>
                  <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: s.state === 'idle' ? '#94a3b8' : s.state === 'failed' ? '#e11d48' : a.color }}>
                    {s.state === 'working' ? <Loader2 className="h-3 w-3 animate-spin" /> : s.state === 'done' ? <CheckCircle2 className="h-3 w-3" /> : s.state === 'failed' ? <XCircle className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                    {STATE_LABEL[s.state]}
                    {s.count > 0 && <span className="font-normal text-black/35" title={`${s.count} events`}>· {s.count}</span>}
                  </div>
                </div>
              </div>
              {!compact && (
                <div className="mt-1.5 line-clamp-2 min-h-[28px] text-[11px] leading-[14px] text-black/45">
                  {s.last?.summary ?? a.role}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
