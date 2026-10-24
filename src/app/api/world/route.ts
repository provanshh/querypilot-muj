import { NextResponse } from 'next/server';
import { getLlmStatus } from '@/server/agent/llm';
import { gameWorld } from '@/server/game/islands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [world, llm] = await Promise.all([gameWorld(), getLlmStatus(true)]);
    return NextResponse.json({
      islands: world.islands,
      agents: { available: llm.available, reason: llm.available ? undefined : llm.reason },
    });
  } catch {
    return NextResponse.json({ error: 'The data store is unavailable right now.' }, { status: 503 });
  }
}
