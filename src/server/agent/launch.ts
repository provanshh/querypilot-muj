import { createRun, endRun, type RunHandle } from '@/server/agent/runs';
import { createRecorder } from '@/server/agent/persist';
import { getLlmStatus } from '@/server/agent/llm';
import { getDataset, type DatasetDef } from '@/server/datasets/registry';
import { runDatasetMission } from '@/server/engine/run';
import { cancelRun } from '@/server/agent/master';
import { ensureWorkers } from '@/server/agent/worker';
import type { ApprovalMode, QuestEvent, Verdict } from '@/lib/quest/types';

type RunSource = 'dashboard' | 'game' | 'telegram' | 'script';
const RUN_SOURCES: RunSource[] = ['dashboard', 'game', 'telegram', 'script'];

export interface LaunchOptions {
  question?: string;
  island?: string;
  approval?: ApprovalMode;
  pace?: 'cinematic' | 'fast';
  dataset?: string;
  mode?: 'ask' | 'audit';
  source?: RunSource;
}

export class LaunchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

interface Launched {
  run: RunHandle;
  def: DatasetDef;
  question: string;
  mode: 'ask' | 'audit';
  source: RunSource;
  done: Promise<{ verdict: Verdict | null; status: string }>;
}

/**
 * Starts one agent run (ask or audit) and records it. Every caller (the dashboard, the game, the
 * Telegram bot, scripts) goes through here, so every run lands in the same event log and live feed.
 */
export async function launchMission(body: LaunchOptions, onEvent?: (e: QuestEvent) => void): Promise<Launched> {
  const mode = body.mode === 'audit' ? 'audit' : 'ask';
  const source: RunSource = RUN_SOURCES.includes(body.source as RunSource) ? body.source as RunSource : 'dashboard';
  const datasetId = body.dataset ?? body.island;
  if (!datasetId) throw new LaunchError('Pick a dataset first: upload a CSV.', 400);

  let def: DatasetDef | null;
  try {
    def = await getDataset(datasetId);
  } catch {
    throw new LaunchError('The data store is unavailable right now. Try again in a minute.', 503);
  }
  if (!def) throw new LaunchError('That dataset no longer exists. Upload a CSV to continue.', 404);

  const question = mode === 'audit' ? `Audit ${def.name}` : body.question?.trim();
  if (!question) throw new LaunchError('question required', 400);
  if (question.length > 500) throw new LaunchError('question too long', 400);

  const llm = mode === 'ask' ? await getLlmStatus() : null;
  if (llm && !llm.available) throw new LaunchError(`The agents are unavailable: ${llm.reason}`, 503);
  await ensureWorkers();
  const run = createRun();
  const recorder = createRecorder({
    id: run.id, island: def.id, question, engine: llm ? 'llm' : 'profiler', source, mode, dataset: def.id,
  });
  const send = (e: QuestEvent) => {
    recorder.event(e);
    try { onEvent?.(e); } catch { /* a listener failing must not stop the run */ }
  };

  const done = (async () => {
    let verdict: Verdict | null = null;
    let status = 'error';
    const pace = body.pace === 'fast' ? 'fast' : 'cinematic';
    try {
      verdict = await runDatasetMission(run, { def, mode, question, pace, approval: body.approval === 'ask' ? 'ask' : 'auto' }, send);
      status = verdict.status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status = msg === 'aborted' ? 'halted' : 'error';
      send({
        run_id: run.id, event_id: `${run.id}:err`, seq: 1e6, timestamp: new Date().toISOString(),
        type: 'run.error', agent_id: 'mayor', summary: msg === 'aborted' ? 'Run stopped.' : `Run failed: ${msg}`,
        metadata: { aborted: msg === 'aborted' },
      });
    } finally {
      if (status === 'halted' || status === 'error') await cancelRun(run.id);
      endRun(run.id);
      await recorder.finish(verdict, status);
    }
    return { verdict, status };
  })();

  return { run, def, question, mode, source, done };
}
