import type { QuestEvent, Verdict } from '@/lib/quest/types';
import type { Prisma, Run } from '@/generated/prisma/client';
import { db } from '@/server/db/prisma';
import { broadcast, type LivePayload } from '@/server/live';

const json = (v: unknown) => (v ?? undefined) as Prisma.InputJsonValue | undefined;

/**
 * Event log in Neon: every mission is replayable from the database. Events are written and
 * NOTIFY'd on one ordered chain, so live subscribers see them in sequence.
 */
export function createRecorder(run: {
  id: string; island: string; question: string; engine: string;
  source: string; mode: 'ask' | 'audit'; dataset: string;
}) {
  let chain: Promise<unknown> = db().run.create({
    data: { id: run.id, island: run.island, question: run.question, engine: run.engine, source: run.source, mode: run.mode },
  }).catch(() => {});

  const queue = (fn: () => Promise<unknown>) => {
    chain = chain.then(fn).catch(() => {});
  };

  return {
    event(e: QuestEvent) {
      const live: LivePayload = {
        run_id: e.run_id, island: run.island, seq: e.seq, type: e.type, agent_id: e.agent_id,
        summary: e.summary.slice(0, 240), ts: e.timestamp, question: e.type === 'run.started' ? run.question.slice(0, 200) : undefined,
        source: run.source, mode: run.mode, dataset: run.dataset,
      };
      queue(async () => {
        await db().event.createMany({
          data: [{ runId: e.run_id, seq: e.seq, ts: new Date(e.timestamp), type: e.type, agentId: e.agent_id, summary: e.summary, tableIds: e.table_ids ?? [], metadata: json(e.metadata) }],
          skipDuplicates: true,
        });
        await broadcast(live);
      });
    },
    finish(verdict: Verdict | null, status: string) {
      queue(() => db().run.update({
        where: { id: run.id },
        data: { status, answer: verdict?.answer ?? null, finishedAt: new Date(), verdict: json(verdict) },
      }));
      return chain;
    },
  };
}

interface RunSummary {
  id: string;
  island: string;
  question: string;
  status: string;
  answer: string | null;
  engine: string | null;
  started_at: string;
  finished_at: string | null;
  events: number;
  source?: string | null;
  mode?: string | null;
}

const summary = (r: Run, events: number): RunSummary => ({
  id: r.id, island: r.island, question: r.question, status: r.status,
  answer: r.answer, engine: r.engine, started_at: (r.startedAt ?? new Date()).toISOString(), finished_at: r.finishedAt?.toISOString() ?? null,
  events, source: r.source, mode: r.mode,
});

export async function listRuns(limit = 30): Promise<RunSummary[]> {
  const runs = await db().run.findMany({ orderBy: { startedAt: 'desc' }, take: Math.min(100, Math.max(1, limit)) });
  const counts = await db().event.groupBy({ by: ['runId'], where: { runId: { in: runs.map((r) => r.id) } }, _count: { _all: true } });
  const byRun = new Map(counts.map((c) => [c.runId, c._count._all]));
  return runs.map((r) => summary(r, byRun.get(r.id) ?? 0));
}

export async function runEvents(runId: string): Promise<{ run: (RunSummary & { verdict: Verdict | null }) | null; events: QuestEvent[] }> {
  const r = await db().run.findUnique({ where: { id: runId } });
  if (!r) return { run: null, events: [] };
  const rows = await db().event.findMany({ where: { runId }, orderBy: { seq: 'asc' } });
  const events: QuestEvent[] = rows.map((e) => ({
    run_id: runId,
    event_id: `${runId}:${e.seq}`,
    seq: e.seq,
    timestamp: e.ts.toISOString(),
    type: e.type as QuestEvent['type'],
    agent_id: (e.agentId ?? undefined) as QuestEvent['agent_id'],
    summary: e.summary ?? '',
    table_ids: e.tableIds.length ? e.tableIds : undefined,
    metadata: (e.metadata ?? undefined) as QuestEvent['metadata'],
  }));
  return { run: { ...summary(r, rows.length), verdict: r.verdict as Verdict | null }, events };
}
