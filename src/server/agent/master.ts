import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { db, notify } from '@/server/db/prisma';
import { listen } from '@/server/live';
import type { SkillInput, SkillName, SkillOutput } from './skills';

/**
 * The Mayor's side of the master/worker split. Every agent step becomes a row in
 * qp_meta.agent_tasks; a worker serving that agent claims it, runs it and NOTIFYs qp_task_done.
 * The Mayor never runs agent work itself: it plans, dispatches, waits, and decides what comes next.
 */

/** LLM skills can sit through rate-limit cooldowns across the model chain. */
const SLOW: SkillName[] = ['scout.link', 'engineer.draft', 'verifier.review', 'analyst.answer'];
const ONLINE_MS = 30_000;
const NO_WORKER_MS = 15_000;

const g = globalThis as unknown as { __qpWaiters?: Map<string, () => void>; __qpDoneListen?: Promise<unknown> };
const waiters: Map<string, () => void> = g.__qpWaiters ?? (g.__qpWaiters = new Map());

function listenForDone() {
  g.__qpDoneListen ??= listen('qp_task_done', (p) => waiters.get((p as { id?: string }).id ?? '')?.()).catch(() => { g.__qpDoneListen = undefined; });
  return g.__qpDoneListen;
}

async function workersOnline(agent: string): Promise<number> {
  return db().agentWorker.count({ where: { agents: { has: agent }, lastSeen: { gt: new Date(Date.now() - ONLINE_MS) } } });
}

/** Workers with a fresh heartbeat, for the Mayor's dispatch note. */
export async function onlineAgents(): Promise<{ id: string; agent: string }[]> {
  const rows = await db().agentWorker.findMany({ where: { lastSeen: { gt: new Date(Date.now() - ONLINE_MS) } }, select: { id: true, agents: true } }).catch(() => []);
  return rows.map((w) => ({ id: w.id, agent: w.agents[0] ?? '' }));
}

export interface Dispatched<T> { output: T; workerId: string | null; ms: number }

/** Queues one task for a worker agent and resolves with its output. */
export async function dispatch<K extends SkillName>(runId: string, kind: K, input: SkillInput<K>, signal: AbortSignal): Promise<Dispatched<SkillOutput<K>>> {
  if (signal.aborted) throw new Error('aborted');
  await listenForDone();
  const agent = kind.split('.')[0];
  const id = `task_${randomUUID()}`;
  const timeoutMs = SLOW.includes(kind) ? 300_000 : 120_000;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    let checking = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      waiters.delete(id);
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const check = async () => {
      if (settled || checking) return;
      checking = true;
      try {
        const t = await db().agentTask.findUnique({ where: { id }, select: { status: true, output: true, error: true, workerId: true } });
        if (!t) return;
        const waited = Date.now() - started;
        if (t.status === 'done') finish(() => resolve({ output: t.output as SkillOutput<K>, workerId: t.workerId, ms: waited }));
        else if (t.status === 'failed') finish(() => reject(new Error(t.error ?? `${kind} failed`)));
        else if (t.status === 'cancelled') finish(() => reject(new Error('aborted')));
        else if (waited > timeoutMs) {
          await cancelTasks({ id });
          finish(() => reject(new Error(`The ${agent} worker did not finish ${kind} within ${Math.round(timeoutMs / 1000)} s`)));
        } else if (t.status === 'queued' && waited > NO_WORKER_MS && !(await workersOnline(agent))) {
          await cancelTasks({ id });
          finish(() => reject(new Error(`No ${agent} worker is online. Start the server (in-process workers) or run "bun run worker".`)));
        }
      } catch { /* transient database error: the next poll retries */ } finally {
        checking = false;
      }
    };
    const onAbort = () => {
      void cancelRun(runId);
      finish(() => reject(new Error('aborted')));
    };
    const poll = setInterval(() => void check(), 2000);
    waiters.set(id, () => void check());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) return onAbort();

    db().agentTask.create({ data: { id, runId, agent, kind, input: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue } })
      .then(() => notify('qp_tasks', { id, agent }).catch(() => {}))
      .catch((err) => finish(() => reject(new Error(`Could not queue ${kind}: ${err instanceof Error ? err.message : String(err)}`))));
  });
}

async function cancelTasks(where: Prisma.AgentTaskWhereInput) {
  await db().agentTask.updateMany({ where: { ...where, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled', finishedAt: new Date() } }).catch(() => {});
}

/** Cancels every open task of a run and tells the workers running them to stop. */
export async function cancelRun(runId: string) {
  await cancelTasks({ runId });
  await notify('qp_task_cancel', { runId }).catch(() => {});
}
