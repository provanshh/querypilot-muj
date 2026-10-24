import { getRun } from '@/server/agent/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Approve or deny a pending execution permit. */
export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) return Response.json({ error: 'run not found' }, { status: 404 });
  const { decision } = (await req.json().catch(() => ({}))) as { decision?: string };
  if (decision !== 'approve' && decision !== 'deny') return Response.json({ error: 'decision must be approve or deny' }, { status: 400 });
  if (!run.pendingApproval) return Response.json({ error: 'no permit pending' }, { status: 409 });
  run.pendingApproval(decision);
  return Response.json({ ok: true });
}

/** Halt a running mission. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) return Response.json({ error: 'run not found' }, { status: 404 });
  run.abort.abort();
  return Response.json({ ok: true });
}
