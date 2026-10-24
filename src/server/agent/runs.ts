export type ApprovalDecision = 'approve' | 'deny';

export interface RunHandle {
  id: string;
  abort: AbortController;
  pendingApproval: ((d: ApprovalDecision) => void) | null;
  createdAt: number;
}

const g = globalThis as unknown as { __qpRuns?: Map<string, RunHandle> };
const runs: Map<string, RunHandle> = g.__qpRuns ?? (g.__qpRuns = new Map());

export function createRun(): RunHandle {
  for (const [id, r] of runs) if (Date.now() - r.createdAt > 30 * 60_000) runs.delete(id);
  const id = `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const handle: RunHandle = { id, abort: new AbortController(), pendingApproval: null, createdAt: Date.now() };
  runs.set(id, handle);
  return handle;
}

export function getRun(id: string) {
  return runs.get(id);
}

export function endRun(id: string) {
  runs.delete(id);
}
