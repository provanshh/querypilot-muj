'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentId, ApprovalMode, CheckResult, IslandId, QuestEvent, WorldSchema } from '@/lib/quest/types';
import { CREW, CREW_BY_ID } from '@/lib/quest/crew';
import { islandIds, islandMeta } from '@/lib/quest/islands';
import { portraitUrl } from '@/lib/quest/sprites';
import { cn } from '@/lib/utils';
import { useCrew } from '@/lib/useCrew';
import { Mic } from 'lucide-react';
import { useVoice } from '@/components/app/useVoice';
import { rankFor, type AgentState, type MissionInfo, type Profile, type Toast } from '../useQuest';

export function Portrait({ id, size = 40, ring }: { id: AgentId; size?: number; ring?: string }) {
  const url = useMemo(() => portraitUrl(CREW_BY_ID[id], 4), [id]);
  return (
    <div
      className="shrink-0 bg-slate-800/80 border overflow-hidden"
      style={{ width: size, height: size, borderColor: ring ?? '#334155', boxShadow: ring ? `0 0 0 1px ${ring}55` : undefined, imageRendering: 'pixelated' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={CREW_BY_ID[id].name} className="w-full h-full object-cover object-top" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

const CREW_TAGS: [string, string][] = [['scout', 'SCT'], ['inspector', 'INS'], ['engineer', 'ENG'], ['verifier', 'VRF'], ['analyst', 'ANL']];

/** The Mayor's crew as worker processes: lit when an agent has a live worker, blinking while it holds a task. */
function CrewLine() {
  const crew = useCrew();
  return (
    <div className="mt-1.5 text-[10px] font-mono leading-snug" title="The Mayor (master) dispatches each step to worker processes through a shared task queue">
      <span className="font-pixel text-[9px] text-slate-400">CREW · </span>
      {!crew ? (
        <span className="text-slate-500">{crew === null ? 'checking…' : 'unavailable'}</span>
      ) : (
        <>
          <span className="text-slate-300">MAYOR + {crew.workers.length} WORKERS</span>
          <span className="ml-1.5 inline-flex gap-0.5 align-middle">
            {CREW_TAGS.map(([id, tag]) => {
              const live = crew.workers.some((w) => w.agent === id);
              const busy = (crew.queue[id]?.running ?? 0) + (crew.queue[id]?.queued ?? 0) > 0;
              return (
                <span key={id} className={cn('font-pixel text-[7px] px-0.5 border', live ? 'text-emerald-300 border-emerald-700/70' : 'text-slate-600 border-slate-700', busy && 'qp-blink')}>{tag}</span>
              );
            })}
          </span>
        </>
      )}
    </div>
  );
}

export function CityScanPanel({
  schema, discovered, alerts, agents, profile, onResetFog,
}: {
  schema: WorldSchema; discovered: string[]; alerts: number; agents?: { available: boolean; reason?: string }; profile: Profile; onResetFog: () => void;
}) {
  const rank = rankFor(profile.xp);
  const pct = rank.next ? ((profile.xp - rank.prev) / (rank.next - rank.prev)) * 100 : 100;
  const [legend, setLegend] = useState(false);
  return (
    <div className="qp-panel w-[300px] pointer-events-auto">
      <div className="qp-header">
        <span className="text-amber-400">◆</span> City Scan
        <span className="ml-auto text-[9px] px-1.5 py-0.5 border border-amber-500/60 text-amber-300">READ-ONLY</span>
      </div>
      <div className="px-3 pt-2 pb-2.5">
        <div className="flex items-end gap-2">
          <span className="font-pixel text-3xl text-white leading-none">{discovered.length}<span className="text-slate-500 text-lg">/{schema.tables.length}</span></span>
          <span className="font-pixel text-[10px] text-slate-400 mb-0.5">DISTRICTS MAPPED</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 font-pixel text-[9px]">
          <Chip label="TBL" value={schema.tables.length} color="text-sky-300 border-sky-700/70" />
          <Chip label="FK" value={schema.relationships.length} color="text-cyan-300 border-cyan-700/70" />
          <Chip label="ROWS" value={schema.tables.reduce((a, t) => a + t.rowCount, 0)} color="text-slate-200 border-slate-600" />
          <Chip label="ALRT" value={alerts} color={alerts ? 'text-red-300 border-red-700/80' : 'text-emerald-300 border-emerald-700/70'} />
        </div>
        <div className="mt-2.5 text-[10px] font-mono leading-snug">
          <span className="font-pixel text-[9px] text-slate-400">BRAIN · </span>
          {agents?.available ? (
            <span className="text-emerald-300">online</span>
          ) : (
            <span className="text-rose-300">offline <span className="text-slate-500">— {agents?.reason ?? 'try again in a minute'}</span></span>
          )}
        </div>
        <CrewLine />
        <div className="mt-2.5 pt-2 border-t border-slate-700/60">
          <div className="flex items-center font-pixel text-[9px] text-slate-300">
            <span className="text-amber-400 mr-1">LV{rank.level}</span> {rank.name}
            <span className="ml-auto text-slate-400">{profile.xp} XP</span>
          </div>
          <div className="mt-1 h-1.5 bg-slate-800 border border-slate-700">
            <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-pixel text-[8px] text-slate-400">
            <span>SOLVED {profile.solved}</span>
            <span>TRAPS {profile.trapsCaught}</span>
            <span>DECLINED {profile.abstained}</span>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          <button className="qp-btn text-[8px] px-2 py-1" onClick={() => setLegend((v) => !v)}>{legend ? 'Hide' : 'Map'} legend</button>
          <button className="qp-btn text-[8px] px-2 py-1" onClick={onResetFog} title="Re-hide all districts so the Scout can rediscover them">Reset fog</button>
        </div>
        {legend && (
          <div className="mt-2 text-[10px] font-mono text-slate-300 space-y-1 qp-rise">
            <div><span className="text-amber-300">Building</span> = table · <span className="text-cyan-300">road glow</span> = foreign key · <span className="text-amber-300">gold road</span> = join in use</div>
            <div>Building size = row count tier (≤12, ≤60, ≤150, &gt;150 rows). Unlabelled houses are scenery.</div>
            <div><span className="text-red-400">!</span> data issue found · <span className="text-emerald-400">✓</span> verified result · clouds = not yet mapped</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`border px-1 py-0.5 flex justify-between ${color}`}>
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

const FEED_STYLE: Partial<Record<QuestEvent['type'], { tag: string; cls: string }>> = {
  'run.started': { tag: 'ORDER', cls: 'bg-amber-500 text-slate-900' },
  'plan.created': { tag: 'PLAN', cls: 'bg-amber-700 text-amber-50' },
  'schema.table_discovered': { tag: 'FOUND', cls: 'bg-cyan-600 text-white' },
  'schema.relationship_discovered': { tag: 'ROAD', cls: 'bg-cyan-900 text-cyan-200' },
  'schema.relevance': { tag: 'TARGET', cls: 'bg-cyan-500 text-slate-900' },
  'data.issue_found': { tag: 'ALERT', cls: 'bg-red-600 text-white' },
  'query.generated': { tag: 'SQL', cls: 'bg-orange-500 text-slate-900' },
  'approval.requested': { tag: 'PERMIT', cls: 'bg-yellow-400 text-slate-900' },
  'approval.resolved': { tag: 'STAMP', cls: 'bg-yellow-600 text-white' },
  'query.execution_started': { tag: 'RUN', cls: 'bg-orange-700 text-white' },
  'query.execution_succeeded': { tag: 'ROWS', cls: 'bg-orange-400 text-slate-900' },
  'query.execution_failed': { tag: 'ERROR', cls: 'bg-red-700 text-white' },
  'validation.check_passed': { tag: 'PASS', cls: 'bg-emerald-600 text-white' },
  'validation.check_failed': { tag: 'FAIL', cls: 'bg-red-600 text-white' },
  'validation.check_warned': { tag: 'WARN', cls: 'bg-yellow-600 text-white' },
  'repair.requested': { tag: 'REPAIR', cls: 'bg-fuchsia-600 text-white' },
  'answer.approved': { tag: 'VERDICT', cls: 'bg-emerald-500 text-slate-900' },
  'answer.abstained': { tag: 'ABSTAIN', cls: 'bg-slate-300 text-slate-900' },
  'run.error': { tag: 'HALT', cls: 'bg-red-800 text-white' },
};

export function ConsolePanel({
  schemaName, mission, running, agents, activeAgent, approval, onApprove, checks, feed, onOpenVerdict, hasVerdict,
}: {
  schemaName: string;
  mission: MissionInfo | null;
  running: boolean;
  agents: Record<AgentId, AgentState>;
  activeAgent: AgentId | null;
  approval: { sql: string; attempt: number; tables: string[] } | null;
  onApprove: (d: 'approve' | 'deny') => void;
  checks: CheckResult[];
  feed: QuestEvent[];
  onOpenVerdict: () => void;
  hasVerdict: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  const duty = activeAgent ?? 'mayor';
  const member = CREW_BY_ID[duty];
  const elapsed = mission ? Math.max(0, now - mission.startedAt) / 1000 : 0;
  const seen = (t: QuestEvent['type']) => feed.some((e) => e.type === t);
  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const spot = checks.find((c) => c.id === 'spot');
  const verdictEvent = feed.find((e) => e.type === 'answer.approved' || e.type === 'answer.abstained');

  const trust: { label: string; state: 'ok' | 'bad' | 'pending' | 'na'; detail?: string }[] = [
    { label: 'Schema mapped', state: seen('schema.relevance') ? 'ok' : running ? 'pending' : 'na' },
    { label: 'Data profiled', state: feed.some((e) => e.type === 'agent.task_succeeded' && e.agent_id === 'inspector') ? 'ok' : running ? 'pending' : 'na' },
    { label: 'Query executed', state: seen('query.execution_succeeded') ? 'ok' : seen('query.execution_failed') ? 'bad' : running ? 'pending' : 'na' },
    { label: `Checks ${passed}✓ ${failed}✗`, state: !checks.length ? (running ? 'pending' : 'na') : failed ? 'bad' : 'ok' },
    { label: 'Independent recompute', state: spot ? (spot.status === 'pass' ? 'ok' : 'bad') : 'na' },
    { label: verdictEvent?.type === 'answer.abstained' ? 'Abstained (honest)' : 'Certified verdict', state: verdictEvent ? 'ok' : running ? 'pending' : 'na' },
  ];

  const feedRef = useRef<HTMLDivElement>(null);
  const shown = feed.filter((e) => e.type !== 'schema.relationship_discovered').slice(-40).reverse();

  return (
    <div className="qp-panel w-[340px] pointer-events-auto flex flex-col max-h-[calc(100vh-150px)]">
      <div className="qp-header">
        <span className="truncate">{schemaName}</span>
        <span className={`ml-auto text-[9px] px-1.5 py-0.5 border ${running ? 'border-emerald-500 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>{running ? (mission?.replay ? 'REPLAY' : 'LIVE') : 'IDLE'}</span>
      </div>
      <div className="px-3 pt-2.5 pb-2 border-b border-slate-700/60">
        <div className="font-pixel text-[13px] text-white tracking-wide">MAYOR&apos;S CONSOLE</div>
        <div className="font-pixel text-[9px] text-slate-400 mt-0.5">QUERYPILOT · CREW COMMAND</div>
        {mission && (
          <div className="mt-2 text-[11px] font-mono text-amber-200 leading-snug line-clamp-2">“{mission.question}”</div>
        )}
        <div className="mt-2.5 flex gap-2.5 items-center">
          <Portrait id={duty} size={46} ring={member.color} />
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[8px] text-slate-400">CREW ON DUTY</div>
            <div className="font-pixel text-[12px]" style={{ color: member.color }}>{member.name}</div>
            <div className="text-[10px] font-mono text-slate-300 truncate">{agents[duty]?.task ?? member.role}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 font-pixel text-[8px] text-slate-400">
          <span>MISSION CLOCK</span>
          <span className="text-slate-200">{elapsed.toFixed(1)}s</span>
          {hasVerdict && !running && (
            <button className="qp-btn ml-auto text-[8px] px-2 py-0.5" onClick={onOpenVerdict}>Verdict <span className="qp-key ml-1">V</span></button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-700/60">
        <div className="font-pixel text-[9px] text-slate-400 mb-1.5">TRUST METER · EARNED, NOT GUESSED</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {trust.map((t) => (
            <div key={t.label} className="flex items-center gap-1.5 text-[10px] font-mono">
              <span className={`w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold ${t.state === 'ok' ? 'bg-emerald-500 text-slate-900' : t.state === 'bad' ? 'bg-red-500 text-white' : t.state === 'pending' ? 'bg-slate-600 text-slate-200 qp-blink' : 'bg-slate-800 text-slate-500'}`}>
                {t.state === 'ok' ? '✓' : t.state === 'bad' ? '✗' : t.state === 'pending' ? '·' : '–'}
              </span>
              <span className={t.state === 'na' ? 'text-slate-500' : 'text-slate-200'}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {approval && (
        <div className="mx-3 my-2 border-2 border-amber-500 bg-amber-950/40 p-2.5 qp-rise">
          <div className="font-pixel text-[10px] text-amber-300 flex items-center gap-1.5">
            <span>⚠</span> PERMIT · EXECUTE SQL <span className="ml-auto text-amber-200/70">DRAFT #{approval.attempt}</span>
          </div>
          <pre className="mt-1.5 max-h-36 overflow-auto qp-scroll text-[9.5px] leading-snug font-mono text-amber-50/90 bg-black/40 p-1.5 whitespace-pre-wrap">{approval.sql}</pre>
          <div className="text-[9px] font-mono text-amber-200/70 mt-1">Read-only · max 200 rows · tables: {approval.tables.join(', ')}</div>
          <div className="mt-2 flex gap-2">
            <button className="qp-btn qp-btn-primary flex-1 text-[11px] py-1.5" onClick={() => onApprove('approve')}>Stamp <span className="qp-key ml-1 !bg-amber-200 !text-slate-900">Y</span></button>
            <button className="qp-btn qp-btn-danger flex-1 text-[11px] py-1.5" onClick={() => onApprove('deny')}>Deny <span className="qp-key ml-1">N</span></button>
          </div>
        </div>
      )}

      <div className="flex items-center px-3 pt-2 pb-1">
        <span className="font-pixel text-[9px] text-slate-400">TRANSMISSIONS</span>
        <span className="ml-auto font-pixel text-[8px] px-1.5 py-0.5 bg-amber-500/90 text-slate-900">{feed.length} EVENTS</span>
      </div>
      <div ref={feedRef} className="flex-1 min-h-[120px] overflow-y-auto qp-scroll px-3 pb-3 space-y-1.5">
        {!shown.length && <div className="text-[10px] font-mono text-slate-500 py-3">No transmissions yet. Issue a Mayor&apos;s Order to dispatch the crew.</div>}
        {shown.map((e) => {
          const st = FEED_STYLE[e.type];
          const who = e.agent_id ? CREW_BY_ID[e.agent_id] : undefined;
          return (
            <div key={e.event_id} className="qp-feed-in border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-pixel text-[8px]" style={{ color: who?.color ?? '#94a3b8' }}>{who ? who.name.split(' ')[0].toUpperCase() : 'SYSTEM'}</span>
                {st && <span className={`ml-auto font-pixel text-[7.5px] px-1 py-px ${st.cls}`}>{st.tag}</span>}
              </div>
              <div className="text-[10.5px] font-mono text-slate-200 leading-snug mt-0.5 break-words">{e.summary}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function OrderPanel({
  running, onDispatch, onHalt, approval, setApproval, pace, setPace, inputRef,
  focus, setTarget, suggestions,
}: {
  focus: IslandId;
  setTarget: (t: IslandId) => void;
  suggestions: string[];
  running: boolean;
  onDispatch: (q: string) => void;
  onHalt: () => void;
  approval: ApprovalMode;
  setApproval: (m: ApprovalMode) => void;
  pace: 'cinematic' | 'fast';
  setPace: (p: 'cinematic' | 'fast') => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState('');
  const submit = () => {
    const text = q.trim();
    if (!text || running) return;
    onDispatch(text);
    setQ('');
    inputRef.current?.blur();
  };
  const runningRef = useRef(running);
  useEffect(() => { runningRef.current = running; }, [running]);
  const voice = useVoice((text) => {
    if (runningRef.current) { setQ(text); return; }
    onDispatch(text);
    setQ('');
  });
  const listen = voice.listen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key.toLowerCase() !== 't' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      listen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listen]);
  return (
    <div className="qp-panel w-[460px] pointer-events-auto">
      <div className="qp-header">
        <span className="text-amber-400">◆</span> Mayor&apos;s Order
      </div>
      <div className="px-3 pt-2 pb-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[9px] text-slate-400 w-[86px]">TARGET</span>
          {islandIds().map((id) => (
            <Toggle key={id} on={focus === id} onClick={() => setTarget(id)}><span style={{ color: islandMeta(id).color }}>●</span> {islandMeta(id).short}</Toggle>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[9px] text-slate-400 w-[86px]">CREW</span>
          <div className="flex -space-x-1">
            {CREW.map((c) => <Portrait key={c.id} id={c.id} size={22} ring={c.color} />)}
          </div>
          <span className="ml-auto text-[10px] font-mono text-slate-400">6 agents · 1 orchestrator</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[9px] text-slate-400 w-[86px]">PERMISSIONS</span>
          <Toggle on={approval === 'ask'} onClick={() => setApproval('ask')}>Ask Mayor</Toggle>
          <Toggle on={approval === 'auto'} onClick={() => setApproval('auto')}>Auto-run</Toggle>
          <span className="text-[9px] font-mono text-slate-500 ml-1">{approval === 'ask' ? 'You stamp each SQL before it runs' : 'Read-only, no pause'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[9px] text-slate-400 w-[86px]">PACE</span>
          <Toggle on={pace === 'cinematic'} onClick={() => setPace('cinematic')}>Cinematic</Toggle>
          <Toggle on={pace === 'fast'} onClick={() => setPace('fast')}>Fast</Toggle>
        </div>
        <div className="flex gap-2 pt-1">
          <input
            ref={inputRef}
            value={voice.listening ? voice.interim || q : q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
              e.stopPropagation();
            }}
            placeholder={voice.listening ? 'Listening… speak your order' : running ? 'Crew is on a mission…' : `What should the crew investigate in ${islandMeta(focus).name}?`}
            disabled={running}
            className="qp-input flex-1 px-2.5 py-2 text-[12px] font-mono placeholder:text-slate-500 disabled:opacity-60"
            maxLength={300}
          />
          <button
            onClick={listen}
            title={voice.supported.input ? 'Speak your order (T)' : 'Voice needs Chrome, Edge or Safari'}
            aria-label={voice.listening ? 'Stop listening' : 'Speak your order'}
            className={cn(
              'qp-btn relative grid w-10 place-items-center px-0',
              voice.listening && '!bg-amber-500 !text-slate-900 !border-amber-300',
            )}
          >
            {voice.listening && <span className="absolute inset-0 animate-ping border-2 border-amber-400/70" />}
            <Mic className="relative h-4 w-4" />
          </button>
          {running ? (
            <button className="qp-btn qp-btn-danger px-3 text-[11px]" onClick={onHalt}>Halt <span className="qp-key ml-1">X</span></button>
          ) : (
            <button className="qp-btn qp-btn-primary px-3 text-[11px]" onClick={submit} disabled={!q.trim()}>Dispatch ⏎</button>
          )}
        </div>
        {(voice.listening || voice.error) && (
          <div className={cn('flex items-center gap-2 text-[10px] font-mono', voice.error ? 'text-rose-300' : 'text-amber-300')}>
            {voice.listening ? (
              <><span className="qp-wave flex h-3 items-center gap-[2px]"><span className="h-3" /><span className="h-3" /><span className="h-3" /></span> Listening, the crew will set off when you stop talking</>
            ) : (
              <><span className="flex-1">{voice.error}</span><button className="text-slate-400 hover:text-white" onClick={voice.clearError}>✕</button></>
            )}
          </div>
        )}
        {!running && !voice.listening && !voice.error && (
          <p className="text-[9.5px] font-mono text-slate-500">Tip: tap the mic or press <span className="qp-key">T</span> to give the order by voice.</p>
        )}
        {!running && (
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button key={s} className="text-[9.5px] font-mono px-1.5 py-0.5 border border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-200 bg-slate-900/60" onClick={() => onDispatch(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`qp-btn text-[9px] px-2 py-1 ${on ? '!bg-amber-500 !text-slate-900 !border-amber-300' : ''}`}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------- */

export function CrewBar({ agents, activeAgent, follow, onFollow }: {
  agents: Record<AgentId, AgentState>; activeAgent: AgentId | null; follow: AgentId | null; onFollow: (id: AgentId | null) => void;
}) {
  return (
    <div className="flex gap-1.5 pointer-events-auto">
      {CREW.map((c, i) => {
        const st = agents[c.id];
        const moodColor = st.mood === 'alert' || st.mood === 'fail' ? '#ef4444' : st.mood === 'success' ? '#10b981' : st.mood === 'work' ? c.color : st.mood === 'wait' ? '#93c5fd' : '#475569';
        const isActive = activeAgent === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onFollow(follow === c.id ? null : c.id)}
            className={`qp-panel !p-0 text-left transition-transform ${isActive ? '-translate-y-1' : ''} ${follow === c.id ? 'ring-2 ring-amber-400' : ''}`}
            title={`${c.name} — ${c.role}. ${c.blurb} Press ${i + 1} to follow.`}
          >
            <div className="flex items-center gap-1.5 p-1">
              <div className="relative">
                <Portrait id={c.id} size={38} ring={moodColor} />
                <span className="absolute -top-1 -left-1 qp-key !min-w-[15px] !h-[15px] !text-[8px]">{i + 1}</span>
              </div>
              <div className="min-w-0 hidden 2xl:block w-[64px]">
                <div className="font-pixel text-[9px] truncate" style={{ color: c.color }}>{c.name.split(' ')[1]}</div>
                <div className="font-pixel text-[7px] text-slate-400 truncate">{c.role}</div>
              </div>
            </div>
            <div className="text-center font-pixel text-[7px] pb-0.5 2xl:hidden" style={{ color: c.color }}>{c.name.split(' ')[1]}</div>
            <div className="h-1" style={{ background: moodColor, opacity: st.mood === 'idle' ? 0.3 : 1 }} />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function Toasts({ toasts, onDone }: { toasts: Toast[]; onDone: (id: number) => void }) {
  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => onDone(t.id), Math.max(0, 3400 - (Date.now() - t.at))));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDone]);
  return (
    <div className="flex flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`qp-toast qp-panel px-4 py-2 text-center min-w-[260px] max-w-[520px] ${t.tone === 'good' ? '!border-emerald-500' : t.tone === 'bad' ? '!border-red-500' : '!border-cyan-500'}`}
        >
          <div className={`font-pixel text-[13px] tracking-wider ${t.tone === 'good' ? 'text-emerald-300' : t.tone === 'bad' ? 'text-red-300' : 'text-cyan-200'}`}>{t.text}</div>
          {t.sub && <div className="text-[10.5px] font-mono text-slate-300 mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
