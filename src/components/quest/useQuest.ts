'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AgentId, ApprovalMode, CheckResult, IslandId, QuestEvent, Verdict, WorldSchema,
} from '@/lib/quest/types';
import { generateWorld, type WorldLayout } from '@/lib/quest/island';
import { CREW } from '@/lib/quest/crew';
import { registerIslands } from '@/lib/quest/islands';

export type AgentMood = 'idle' | 'think' | 'work' | 'alert' | 'success' | 'fail' | 'wait';

export interface AgentState {
  id: AgentId;
  target: string; // table name or '__hq__'
  mood: AgentMood;
  task: string;
  say: string;
  sayAt: number;
}

export interface TableMark {
  relevant: boolean;
  issues: string[];
  activity: 'scan' | 'inspect' | 'query' | 'verify' | 'analyze' | null;
  activityAt: number;
  certified: boolean;
  failedAt: number;
  passedAt: number;
}

export interface RoadLink { a: string; b: string; kind: 'fk' | 'join'; at: number }
export interface Toast { id: number; text: string; sub?: string; tone: 'info' | 'good' | 'bad'; at: number }

export interface Profile {
  xp: number;
  solved: number;
  abstained: number;
  trapsCaught: number;
}

export interface MissionInfo {
  question: string;
  startedAt: number;
  runId?: string;
  replay?: boolean;
}

interface IslandInfo { id: IslandId; name: string; schema: WorldSchema; questions: { id: string; question: string }[] }

export interface WorldState {
  ready: boolean;
  error?: string;
  islands?: Record<IslandId, IslandInfo>;
  /** Island ids in map order (newest upload first). */
  order: IslandId[];
  agents?: { available: boolean; reason?: string };
  layout?: WorldLayout;
}

interface LaneState {
  id: IslandId;
  discovered: string[];
  agents: Record<AgentId, AgentState>;
  marks: Record<string, TableMark>;
  links: RoadLink[];
  feed: QuestEvent[];
  toasts: Toast[];
  approval: { sql: string; attempt: number; tables: string[] } | null;
  drafts: { attempt: number; sql: string }[];
  checks: CheckResult[];
  verdict: Verdict | null;
  mission: MissionInfo | null;
  running: boolean;
  activeAgent: AgentId | null;
}

const PROFILE_KEY = 'querypilot-quest-profile-v3';
const fogKey = (id: IslandId) => `querypilot-fog-v3-${id}`;

function initialAgents(): Record<AgentId, AgentState> {
  return Object.fromEntries(
    CREW.map((c) => [c.id, { id: c.id, target: '__hq__', mood: 'idle', task: 'Standing by at City Hall', say: '', sayAt: 0 }]),
  ) as Record<AgentId, AgentState>;
}

function emptyMark(): TableMark {
  return { relevant: false, issues: [], activity: null, activityAt: 0, certified: false, failedAt: 0, passedAt: 0 };
}

function initialLane(id: IslandId): LaneState {
  return {
    id, discovered: [], agents: initialAgents(), marks: {}, links: [], feed: [], toasts: [], approval: null,
    drafts: [], checks: [], verdict: null, mission: null, running: false, activeAgent: null,
  };
}

type Action =
  | { type: 'fog'; discovered: string[] }
  | { type: 'start'; mission: MissionInfo }
  | { type: 'event'; e: QuestEvent }
  | { type: 'runId'; runId: string }
  | { type: 'ended' }
  | { type: 'dismissToast'; id: number }
  | { type: 'closeVerdict' }
  | { type: 'resetFog' };

let toastId = 1;

function say(s: LaneState, id: AgentId, patch: Partial<AgentState>): LaneState {
  const now = Date.now();
  return {
    ...s,
    activeAgent: id,
    agents: { ...s.agents, [id]: { ...s.agents[id], ...patch, ...(patch.say ? { sayAt: now } : {}) } },
  };
}

function mark(s: LaneState, tables: string[] | undefined, patch: (m: TableMark) => Partial<TableMark>): LaneState {
  if (!tables?.length) return s;
  const marks = { ...s.marks };
  for (const t of tables) {
    const m = marks[t] ?? emptyMark();
    marks[t] = { ...m, ...patch(m) };
  }
  return { ...s, marks };
}

function toast(s: LaneState, text: string, tone: Toast['tone'], sub?: string): LaneState {
  return { ...s, toasts: [...s.toasts.slice(-3), { id: toastId++, text, sub, tone, at: Date.now() }] };
}

function short(text: string, n = 64) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function reduce(s: LaneState, a: Action): LaneState {
  switch (a.type) {
    case 'fog':
      return { ...s, discovered: a.discovered };
    case 'start':
      return { ...initialLane(s.id), discovered: s.discovered, toasts: s.toasts, mission: a.mission, running: true };
    case 'runId':
      return s.mission ? { ...s, mission: { ...s.mission, runId: a.runId } } : s;
    case 'ended':
      return { ...s, running: false, approval: null, agents: Object.fromEntries(Object.entries(s.agents).map(([k, v]) => [k, { ...v, target: '__hq__', mood: v.mood === 'fail' ? 'fail' : 'idle' }])) as LaneState['agents'] };
    case 'dismissToast':
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    case 'closeVerdict':
      return { ...s, verdict: null };
    case 'resetFog':
      return { ...s, discovered: [] };
    case 'event':
      return applyEvent({ ...s, feed: [...s.feed, a.e].slice(-160) }, a.e);
  }
}

function applyEvent(s: LaneState, e: QuestEvent): LaneState {
  const agent = e.agent_id;
  const tables = e.table_ids;
  const md = e.metadata ?? {};
  const now = Date.now();

  switch (e.type) {
    case 'run.started':
      return say(s, 'mayor', { mood: 'think', say: 'New order! Crew, assemble.', task: 'Planning the mission' });
    case 'plan.created':
      return say(s, 'mayor', { mood: 'work', say: 'Plan is set. Scout, go!', task: 'Routing tasks' });
    case 'agent.task_started': {
      if (!agent) return s;
      const target = tables?.[0] ?? (agent === 'analyst' ? firstRelevant(s) ?? '__hq__' : '__hq__');
      const activity = agent === 'inspector' ? 'inspect' : agent === 'verifier' ? 'verify' : agent === 'engineer' ? 'query' : agent === 'analyst' ? 'analyze' : 'scan';
      let next = say(s, agent, { mood: 'work', say: short(e.summary), task: e.summary, target });
      next = mark(next, tables, () => ({ activity, activityAt: now }));
      return next;
    }
    case 'agent.task_waiting':
      return agent ? say(s, agent, { mood: 'wait', say: short(e.summary), target: '__hq__' }) : s;
    case 'agent.task_succeeded':
      return agent ? say(s, agent, { mood: 'success', say: short(e.summary), task: e.summary }) : s;
    case 'agent.task_failed':
      return agent ? say(s, agent, { mood: 'fail', say: short(e.summary), task: e.summary }) : s;
    case 'agent.say':
      return agent ? say(s, agent, { say: short(e.summary, 80) }) : s;
    case 'schema.table_discovered': {
      const t = tables?.[0];
      if (!t) return s;
      let next = say(s, 'scout', { mood: 'work', target: t, say: short(e.summary), task: e.summary });
      next = mark(next, [t], () => ({ activity: 'scan', activityAt: now }));
      if (!next.discovered.includes(t)) {
        next = { ...next, discovered: [...next.discovered, t] };
        next = toast(next, `DISTRICT DISCOVERED: ${t}`, 'info', `${md.rowCount ?? '?'} rows · ${md.columns ?? '?'} columns`);
      }
      return next;
    }
    case 'schema.relationship_discovered':
      if (!tables || tables.length < 2) return s;
      return { ...s, links: [...s.links.filter((l) => now - l.at < 4000).slice(-12), { a: tables[0], b: tables[1], kind: 'fk', at: now }] };
    case 'schema.relevance': {
      let next = say(s, 'scout', { mood: 'success', say: short(e.summary, 80) });
      next = mark(next, tables, () => ({ relevant: true }));
      return next;
    }
    case 'data.issue_found': {
      const t = tables?.[0];
      let next = say(s, 'inspector', { mood: 'alert', target: t ?? s.agents.inspector.target, say: short(e.summary, 80), task: e.summary });
      next = mark(next, tables, (m) => ({ issues: [...m.issues, e.summary], activity: 'inspect', activityAt: now }));
      return next;
    }
    case 'data.profile_clean':
      return mark(say(s, 'inspector', { mood: 'success', say: 'Data looks clean.' }), tables, () => ({ passedAt: now }));
    case 'query.generated': {
      const sql = String(md.sql ?? '');
      const attempt = Number(md.attempt ?? 1);
      let next = say(s, 'engineer', { mood: 'work', target: tables?.[0] ?? s.agents.engineer.target, say: short(e.summary), task: e.summary });
      next = { ...next, drafts: [...next.drafts.filter((d) => d.attempt !== attempt), { attempt, sql }], checks: [] };
      return next;
    }
    case 'approval.requested':
      return { ...say(s, 'engineer', { mood: 'wait', target: '__hq__', say: 'Mayor, I need a permit stamp!' }), approval: { sql: String(md.sql ?? ''), attempt: Number(md.attempt ?? 1), tables: tables ?? [] } };
    case 'approval.resolved': {
      const ok = md.decision === 'approve';
      let next = say({ ...s, approval: null }, 'mayor', { mood: ok ? 'success' : 'fail', say: ok ? 'STAMPED. Go!' : 'DENIED.' });
      next = toast(next, ok ? 'PERMIT STAMPED' : 'PERMIT DENIED', ok ? 'good' : 'bad');
      return next;
    }
    case 'query.execution_started': {
      let next = say(s, 'engineer', { mood: 'work', target: tables?.[0] ?? s.agents.engineer.target, say: short(e.summary) });
      next = mark(next, tables, () => ({ activity: 'query', activityAt: now }));
      if (tables && tables.length > 1) {
        const links: RoadLink[] = [];
        for (let i = 1; i < tables.length; i++) links.push({ a: tables[0], b: tables[i], kind: 'join', at: now });
        next = { ...next, links: [...next.links.filter((l) => now - l.at < 4000), ...links] };
      }
      return next;
    }
    case 'query.execution_succeeded':
      return say(s, 'engineer', { mood: 'success', say: short(e.summary) });
    case 'query.execution_failed':
      return toast(mark(say(s, 'engineer', { mood: 'fail', say: short(e.summary, 80) }), tables, () => ({ failedAt: now })), 'QUERY CRASHED', 'bad', short(e.summary, 90));
    case 'validation.check_passed':
    case 'validation.check_failed':
    case 'validation.check_warned': {
      const check = md.check as CheckResult | undefined;
      const fail = e.type === 'validation.check_failed';
      const target = check?.tables?.[0] ?? tables?.[0] ?? s.agents.verifier.target;
      let next = say(s, 'verifier', { mood: fail ? 'alert' : e.type === 'validation.check_warned' ? 'think' : 'success', target, say: short(`${fail ? '✗' : '✓'} ${check?.label ?? e.summary}`, 70) });
      next = mark(next, check?.tables ?? tables, () => (fail ? { failedAt: now, activity: 'verify', activityAt: now } : { passedAt: now, activity: 'verify', activityAt: now }));
      if (check) next = { ...next, checks: [...next.checks.filter((c) => c.id !== check.id), check] };
      if (fail) next = toast(next, 'TRAP DETECTED', 'bad', check?.label);
      return next;
    }
    case 'repair.requested':
      return say(say(s, 'verifier', { mood: 'alert', say: 'Back to the yard — fix it!' }), 'engineer', { mood: 'think', say: 'On it. Repairing the query…' });
    case 'answer.approved': {
      let next = say(s, 'analyst', { mood: 'success', say: 'Verdict filed. Certified.', target: tables?.[0] ?? '__hq__' });
      next = mark(next, tables, () => ({ certified: true }));
      return toast(next, 'CASE SOLVED', 'good', short(e.summary, 90));
    }
    case 'answer.abstained': {
      const next = say(s, 'analyst', { mood: 'think', say: 'The data cannot support an answer.', target: '__hq__' });
      return toast(next, 'NO ANSWER — HONESTLY', 'info', short(e.summary, 90));
    }
    case 'run.finished':
      return md.verdict ? { ...s, verdict: md.verdict as Verdict } : s;
    case 'run.error':
      return toast(say(s, 'mayor', { mood: 'fail', say: short(e.summary) }), md.aborted ? 'MISSION HALTED' : 'MISSION ERROR', 'bad', e.summary);
    default:
      return s;
  }
}

function firstRelevant(s: LaneState) {
  return Object.entries(s.marks).find(([, m]) => m.relevant)?.[0];
}

export function rankFor(xp: number) {
  const ranks = [
    { at: 0, name: 'Rookie Analyst' },
    { at: 60, name: 'Data Detective' },
    { at: 160, name: 'Senior Inspector' },
    { at: 320, name: 'Chief of Evidence' },
    { at: 520, name: 'Mayor of Truth' },
  ];
  let idx = 0;
  ranks.forEach((r, i) => { if (xp >= r.at) idx = i; });
  const next = ranks[idx + 1];
  return { name: ranks[idx].name, level: idx + 1, next: next?.at, prev: ranks[idx].at };
}

/* --------------------------------- world ---------------------------------- */

export function useWorld() {
  const [world, setWorld] = useState<WorldState>({ ready: false, order: [] });
  const load = useCallback(() => {
    setWorld((w) => ({ ...w, error: undefined }));
    fetch('/api/world')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        return d as { islands: IslandInfo[]; agents: WorldState['agents'] };
      })
      .then((d) => {
        registerIslands(d.islands);
        setWorld({
          ready: true,
          islands: Object.fromEntries(d.islands.map((i) => [i.id, i])),
          order: d.islands.map((i) => i.id),
          agents: d.agents,
          layout: generateWorld(d.islands.map((i) => i.schema)),
        });
      })
      .catch((err) => setWorld((w) => ({ ...w, error: err instanceof Error ? err.message : String(err) })));
  }, []);
  useEffect(load, [load]);
  return { world, reload: load };
}

/* -------------------------------- profile --------------------------------- */

const EMPTY_PROFILE: Profile = { xp: 0, solved: 0, abstained: 0, trapsCaught: 0 };

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [lastXp, setLastXp] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setProfile({ ...EMPTY_PROFILE, ...(JSON.parse(raw) as Profile) });
    } catch { /* ignore */ }
  }, []);

  const award = useCallback((verdict: Verdict) => {
    setProfile((prev) => {
      const p = { ...prev };
      let xp = 0;
      const traps = new Set<string>();
      verdict.attempts.slice(0, -1).forEach((a) => a.failedChecks.forEach((c) => traps.add(c)));
      if (verdict.status === 'answered') { xp += 20; p.solved += 1; } else { p.abstained += 1; xp += 10; }
      xp += traps.size * 8;
      p.trapsCaught += traps.size;
      p.xp += xp;
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
      setLastXp(xp);
      return p;
    });
  }, []);

  return { profile, award, lastXp };
}

/* ---------------------------------- lane ---------------------------------- */

type StartOptions = { question: string; approval: ApprovalMode; pace: 'cinematic' | 'fast' };

/** One island's mission state: its own crew, fog, feed and verdict. */
export function useLane(id: IslandId, world: WorldState, award: (v: Verdict) => void) {
  const [state, dispatch] = useReducer(reduce, id, initialLane);
  const abortRef = useRef<AbortController | null>(null);
  const eventsRef = useRef<QuestEvent[]>([]);
  const lastMissionRef = useRef<{ mission: MissionInfo; events: QuestEvent[] } | null>(null);
  const [fogLoaded, setFogLoaded] = useState(false);

  useEffect(() => {
    if (!world.ready || fogLoaded) return;
    let discovered: string[] = [];
    try { discovered = JSON.parse(localStorage.getItem(fogKey(id)) || '[]'); } catch { /* ignore */ }
    const tables = world.islands?.[id]?.schema.tables ?? [];
    dispatch({ type: 'fog', discovered: discovered.filter((t) => tables.some((x) => x.name === t)) });
    setFogLoaded(true);
  }, [world.ready, world.islands, id, fogLoaded]);

  useEffect(() => {
    if (!fogLoaded || !world.islands?.[id]) return;
    try { localStorage.setItem(fogKey(id), JSON.stringify(state.discovered)); } catch { /* ignore */ }
  }, [state.discovered, fogLoaded, id, world.islands]);

  const start = useCallback(async (opts: StartOptions) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const mission: MissionInfo = { question: opts.question, startedAt: Date.now() };
    eventsRef.current = [];
    dispatch({ type: 'start', mission });
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...opts, dataset: id, source: 'game' }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const runId = res.headers.get('X-Run-Id');
      if (runId) dispatch({ type: 'runId', runId });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as QuestEvent;
          eventsRef.current.push(e);
          dispatch({ type: 'event', e });
          if (e.type === 'run.finished' && e.metadata?.verdict) award(e.metadata.verdict as Verdict);
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        dispatch({ type: 'event', e: { run_id: 'local', event_id: `local:${Date.now()}`, seq: 0, timestamp: new Date().toISOString(), type: 'run.error', agent_id: 'mayor', summary: `Connection lost: ${err instanceof Error ? err.message : String(err)}` } });
      }
    } finally {
      lastMissionRef.current = { mission, events: [...eventsRef.current] };
      dispatch({ type: 'ended' });
    }
  }, [award, id]);

  const approve = useCallback(async (decision: 'approve' | 'deny') => {
    const runId = state.mission?.runId;
    if (!runId || !state.approval) return;
    await fetch(`/api/missions/${runId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
  }, [state.mission?.runId, state.approval]);

  const halt = useCallback(async () => {
    const runId = state.mission?.runId;
    if (runId && !state.mission?.replay) await fetch(`/api/missions/${runId}`, { method: 'DELETE' }).catch(() => {});
    abortRef.current?.abort();
  }, [state.mission]);

  const playEvents = useCallback(async (mission: MissionInfo, events: QuestEvent[]) => {
    if (!events.length) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: 'start', mission: { ...mission, startedAt: Date.now(), replay: true } });
    let prev = new Date(events[0].timestamp).getTime();
    for (const e of events) {
      const t = new Date(e.timestamp).getTime();
      const wait = Math.min(1500, Math.max(0, t - prev));
      prev = t;
      await new Promise((r) => setTimeout(r, wait));
      if (ctrl.signal.aborted) break;
      if (e.type === 'approval.requested') continue;
      dispatch({ type: 'event', e });
    }
    dispatch({ type: 'ended' });
  }, []);

  /** Replays the last mission's stored event log. Nothing is re-executed. */
  const replay = useCallback(async () => {
    const last = lastMissionRef.current;
    if (last) await playEvents({ ...last.mission, runId: undefined }, last.events);
  }, [playEvents]);

  /** Replays any past mission straight from the stored event log. */
  const replayRun = useCallback(async (runId: string) => {
    const r = await fetch(`/api/runs/${runId}`);
    if (!r.ok) return;
    const d = (await r.json()) as { run: { question: string }; events: QuestEvent[] };
    await playEvents({ question: d.run.question, startedAt: Date.now(), runId }, d.events);
  }, [playEvents]);

  const closeVerdict = useCallback(() => dispatch({ type: 'closeVerdict' }), []);
  const dismissToast = useCallback((tid: number) => dispatch({ type: 'dismissToast', id: tid }), []);
  const resetFog = useCallback(() => dispatch({ type: 'resetFog' }), []);

  return {
    id,
    state,
    start,
    approve,
    halt,
    replay,
    replayRun,
    canReplay: !!lastMissionRef.current?.events.length,
    closeVerdict,
    dismissToast,
    resetFog,
  };
}
