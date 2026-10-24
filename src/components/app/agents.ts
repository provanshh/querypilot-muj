import { Compass, Database, ScanSearch, Code2, ShieldCheck, FileText, type LucideIcon } from 'lucide-react';
import type { AgentId, QuestEvent } from '@/lib/quest/types';

interface AgentMeta {
  id: AgentId;
  title: string;
  role: string;
  icon: LucideIcon;
  color: string;
  soft: string;
  text: string;
}

export const AGENTS: AgentMeta[] = [
  { id: 'mayor', title: 'Orchestrator', role: 'Plans the run and hands out tasks', icon: Compass, color: '#1d1d1f', soft: 'bg-[#f0f0f0]', text: 'text-[#1d1d1f]' },
  { id: 'scout', title: 'Schema Explorer', role: 'Reads tables, columns and keys', icon: Database, color: '#7c6cf0', soft: 'bg-[#ece8fd]', text: 'text-[#5b47d6]' },
  { id: 'inspector', title: 'Quality Inspector', role: 'Profiles values and finds problems', icon: ScanSearch, color: '#e8962e', soft: 'bg-amber-50', text: 'text-amber-700' },
  { id: 'engineer', title: 'SQL Engineer', role: 'Writes and runs read-only SQL', icon: Code2, color: '#4f7cf0', soft: 'bg-blue-50', text: 'text-blue-700' },
  { id: 'verifier', title: 'Verifier', role: 'Challenges every result independently', icon: ShieldCheck, color: '#86b31c', soft: 'bg-[#eef9c8]', text: 'text-[#4d6b00]' },
  { id: 'analyst', title: 'Analyst', role: 'Answers with evidence, or declines', icon: FileText, color: '#e2557a', soft: 'bg-rose-50', text: 'text-rose-700' },
];

export const agentMeta = (id?: AgentId) => AGENTS.find((a) => a.id === id) ?? AGENTS[0];

export type AgentState = 'idle' | 'working' | 'done' | 'failed';

/** Derives each agent's live state from the event stream (the UI never animates without an event). */
export function agentStates(events: QuestEvent[], running: boolean): Record<AgentId, { state: AgentState; last?: QuestEvent; count: number }> {
  const out = Object.fromEntries(AGENTS.map((a) => [a.id, { state: 'idle' as AgentState, count: 0 }])) as Record<AgentId, { state: AgentState; last?: QuestEvent; count: number }>;
  for (const e of events) {
    if (!e.agent_id) continue;
    const s = out[e.agent_id];
    s.count += 1;
    s.last = e;
    if (e.type === 'agent.task_started' || e.type === 'run.started') s.state = 'working';
    else if (e.type === 'agent.task_succeeded' || e.type === 'answer.approved' || e.type === 'answer.abstained') s.state = 'done';
    else if (e.type === 'agent.task_failed') s.state = 'failed';
    else if (s.state === 'idle') s.state = 'working';
  }
  if (!running) {
    for (const a of AGENTS) if (out[a.id].state === 'working') out[a.id].state = 'done';
  }
  if (running && out.mayor.state === 'done') out.mayor.state = 'working';
  return out;
}
