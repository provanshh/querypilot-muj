import os from 'node:os';
import type { Prisma } from '@/generated/prisma/client';
import type { CrewStatus } from '@/lib/quest/types';
import { db, notify } from '@/server/db/prisma';
import { listen, liveConnected } from '@/server/live';
import { SKILLS, WORKER_AGENTS, type SkillName, type WorkerAgent } from './skills';

/**
 * Worker side of the master/worker split. A pool serves one or more agents; each agent shows up as
 * its own worker row (`<pool>:<agent>`) with a heartbeat. Tasks are claimed with
 * FOR UPDATE SKIP LOCKED, so any number of pools (the web server, `bun run worker` on other
 * machines) can share one queue without double-processing a task.
 */

interface Claimed { id: string; runId: string; agent: WorkerAgent; kind: string; input: unknown }

interface Pool {
  id: string;
  agents: WorkerAgent[];
  concurrency: number;
  active: Map<string, { runId: string; ac: AbortController }>;
  pumping: boolean;
  again: boolean;
  stopped: boolean;
  timers: ReturnType<typeof setInterval>[];
  unlisten: (() => void)[];
}

const HEARTBEAT_MS = 10_000;
const DEAD_MS = 60_000;
const MAX_ATTEMPTS = 3;

const workerId = (p: Pool, agent: string) => `${p.id}:${agent}`;
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function claim(p: Pool): Promise<Claimed | undefined> {
  const [t] = await db().$queryRaw<Claimed[]>`
    UPDATE qp_meta.agent_tasks
    SET status = 'running', worker_id = ${p.id} || ':' || agent, started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM qp_meta.agent_tasks
      WHERE status = 'queued' AND agent = ANY(${p.agents}::text[]) AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
    RETURNING id, run_id AS "runId", agent, kind, input`;
  return t;
}

async function runTask(p: Pool, t: Claimed) {
  const ac = new AbortController();
  p.active.set(t.id, { runId: t.runId, ac });
  try {
    const skill = SKILLS[t.kind as SkillName] as ((input: unknown, signal: AbortSignal) => Promise<unknown>) | undefined;
    if (!skill) throw new Error(`No skill "${t.kind}"`);
    const output = await skill(t.input, ac.signal);
    await db().agentTask.updateMany({
      where: { id: t.id, status: 'running' },
      data: { status: 'done', output: JSON.parse(JSON.stringify(output ?? null)) as Prisma.InputJsonValue, finishedAt: new Date() },
    });
  } catch (err) {
    await db().agentTask.updateMany({ where: { id: t.id, status: 'running' }, data: { status: 'failed', error: errText(err).slice(0, 2000), finishedAt: new Date() } }).catch(() => {});
  } finally {
    p.active.delete(t.id);
    await db().agentWorker.update({ where: { id: workerId(p, t.agent) }, data: { tasksDone: { increment: 1 }, lastSeen: new Date() } }).catch(() => {});
    await notify('qp_task_done', { id: t.id }).catch(() => {});
    void pump(p);
  }
}

/** Claims tasks until the pool is full or the queue is empty. */
async function pump(p: Pool) {
  if (p.pumping) { p.again = true; return; }
  p.pumping = true;
  try {
    do {
      p.again = false;
      while (!p.stopped && p.active.size < p.concurrency) {
        const t = await claim(p);
        if (!t) break;
        void runTask(p, t);
      }
    } while (p.again && !p.stopped);
  } catch { /* database unreachable: the next tick retries */ } finally {
    p.pumping = false;
  }
}

async function register(p: Pool) {
  const data = p.agents.map((agent) => ({ id: workerId(p, agent), agents: [agent], host: os.hostname(), pid: process.pid }));
  await db().agentWorker.createMany({ data, skipDuplicates: true });
}

async function heartbeat(p: Pool) {
  const ids = p.agents.map((a) => workerId(p, a));
  const { count } = await db().agentWorker.updateMany({ where: { id: { in: ids } }, data: { lastSeen: new Date() } });
  if (count < ids.length) await register(p);
}

/** Hands tasks held by dead workers back to the queue and retires old finished tasks. */
async function sweep() {
  const dead = await db().agentWorker.findMany({ where: { lastSeen: { lt: new Date(Date.now() - DEAD_MS) } }, select: { id: true } });
  if (dead.length) {
    const ids = dead.map((w) => w.id);
    await db().agentTask.updateMany({ where: { status: 'running', workerId: { in: ids } }, data: { status: 'queued', workerId: null, startedAt: null } });
    await db().agentWorker.deleteMany({ where: { id: { in: ids } } });
  }
  await db().agentTask.deleteMany({ where: { finishedAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
}

export async function startWorkerPool(opts: { agents?: WorkerAgent[]; concurrency?: number } = {}): Promise<Pool> {
  const p: Pool = {
    id: `${os.hostname().split('.')[0]}:${process.pid}:${Math.random().toString(36).slice(2, 6)}`,
    agents: opts.agents?.length ? opts.agents : [...WORKER_AGENTS],
    concurrency: opts.concurrency ?? Number(process.env.QP_WORKER_CONCURRENCY ?? 6),
    active: new Map(), pumping: false, again: false, stopped: false, timers: [], unlisten: [],
  };
  await register(p);
  p.unlisten.push(await listen('qp_tasks', (m) => { if (p.agents.includes((m as { agent?: WorkerAgent }).agent!)) void pump(p); }));
  p.unlisten.push(await listen('qp_task_cancel', (m) => {
    const runId = (m as { runId?: string }).runId;
    for (const t of p.active.values()) if (t.runId === runId) t.ac.abort();
  }));
  let tick = 0;
  p.timers.push(setInterval(() => {
    tick += 1;
    // NOTIFY wakes the pool instantly; polling is the fallback when the LISTEN connection is down.
    if (!liveConnected() || tick % 5 === 0) void pump(p);
  }, 3000));
  p.timers.push(setInterval(() => void heartbeat(p).catch(() => {}), HEARTBEAT_MS));
  p.timers.push(setInterval(() => void sweep().catch(() => {}), 30_000));
  void sweep().catch(() => {});
  void pump(p);
  return p;
}

export async function stopWorkerPool(p: Pool) {
  if (p.stopped) return;
  p.stopped = true;
  p.timers.forEach(clearInterval);
  p.unlisten.forEach((u) => u());
  p.active.forEach((t) => t.ac.abort());
  await db().agentWorker.deleteMany({ where: { id: { in: p.agents.map((a) => workerId(p, a)) } } }).catch(() => {});
}

const g = globalThis as unknown as { __qpWorkers?: Promise<Pool | null>; __qpSkills?: unknown };

/** Starts this process's worker pool once, unless QP_WORKERS=external (workers run elsewhere). */
export function ensureWorkers(): Promise<Pool | null> {
  if (process.env.QP_WORKERS === 'external') return Promise.resolve(null);
  // A hot reload creates a new SKILLS object; a pool started earlier would keep running the old code.
  if (g.__qpWorkers && g.__qpSkills !== SKILLS) {
    const old = g.__qpWorkers;
    g.__qpWorkers = undefined;
    void old.then((p) => (p ? stopWorkerPool(p) : undefined));
  }
  g.__qpSkills = SKILLS;
  g.__qpWorkers ??= startWorkerPool().catch((err) => {
    g.__qpWorkers = undefined;
    console.error('[workers] could not start:', errText(err));
    return null;
  });
  return g.__qpWorkers;
}

/** Live workers and the last day's queue, for the dashboard and the game. */
export async function crewStatus(): Promise<CrewStatus> {
  const local = await g.__qpWorkers;
  const [workers, counts] = await Promise.all([
    db().agentWorker.findMany({ where: { lastSeen: { gt: new Date(Date.now() - 30_000) } }, orderBy: { startedAt: 'asc' } }),
    db().agentTask.groupBy({ by: ['agent', 'status'], where: { createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } }, _count: { _all: true } }),
  ]);
  const queue: CrewStatus['queue'] = Object.fromEntries(WORKER_AGENTS.map((a) => [a, { queued: 0, running: 0, done: 0, failed: 0 }]));
  for (const c of counts) {
    const q = queue[c.agent];
    if (q && c.status in q) q[c.status as keyof typeof q] += c._count._all;
  }
  return {
    workers: workers.map((w) => ({
      id: w.id, agent: w.agents[0] ?? '', host: w.host, pid: w.pid, tasksDone: w.tasksDone,
      lastSeen: w.lastSeen.toISOString(), startedAt: w.startedAt.toISOString(), local: !!local && w.id.startsWith(`${local.id}:`),
    })),
    queue,
    mode: process.env.QP_WORKERS === 'external' ? 'external' : 'in-process',
  };
}
