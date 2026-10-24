/**
 * Standalone worker process: serves agent tasks from the shared Postgres queue.
 *   bun run worker                         all agents
 *   bun run worker -- --agents engineer,verifier --concurrency 4
 * Run the web server with QP_WORKERS=external to have every task served by processes like this one.
 */
import { startWorkerPool, stopWorkerPool } from '@/server/agent/worker';
import { WORKER_AGENTS, type WorkerAgent } from '@/server/agent/skills';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const agents = (arg('agents')?.split(',').map((s) => s.trim()) ?? []) as WorkerAgent[];
const unknown = agents.filter((a) => !WORKER_AGENTS.includes(a));
if (unknown.length) {
  console.error(`Unknown agent(s): ${unknown.join(', ')}. Choose from ${WORKER_AGENTS.join(', ')}.`);
  process.exit(1);
}
const concurrency = arg('concurrency') ? Number(arg('concurrency')) : undefined;

const pool = await startWorkerPool({ agents, concurrency });
console.log(`Worker pool ${pool.id} serving ${pool.agents.join(', ')} (concurrency ${pool.concurrency}).`);

const stop = async () => {
  await stopWorkerPool(pool);
  process.exit(0);
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
