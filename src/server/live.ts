import { Client } from 'pg';
import { directUrl } from '@/server/db/pg';
import { notify } from '@/server/db/prisma';

/**
 * Real-time fan-out over Postgres LISTEN/NOTIFY. Every mission event is NOTIFY'd on `qp_live`;
 * each server instance holds one LISTEN connection (direct endpoint — the pooler can't LISTEN)
 * and pushes payloads to its SSE subscribers. Works across tabs, browsers and server instances.
 */

export interface LivePayload {
  run_id: string;
  island: string;
  seq: number;
  type: string;
  agent_id?: string;
  summary: string;
  ts: string;
  question?: string;
  /** Where the run was started: dashboard, game, telegram or script. */
  source?: string;
  mode?: 'ask' | 'audit';
  /** Dataset id the run belongs to (island is 'tidy'/'cluttered' for legacy school runs). */
  dataset?: string;
}

/** Non-run activity (e.g. the game opening) shared over the same channel; run_id is ''. */
export function uiPayload(type: string, summary: string, extra: Partial<LivePayload> = {}): LivePayload {
  return { run_id: '', island: extra.island ?? '', seq: 0, type, summary: summary.slice(0, 240), ts: new Date().toISOString(), ...extra };
}

type Handler = (payload: unknown) => void;

interface LiveState {
  channels: Map<string, Set<Handler>>;
  client?: Client;
  connecting?: Promise<void>;
  connected: boolean;
  retry?: ReturnType<typeof setTimeout>;
}

const g = globalThis as unknown as { __qpListen?: LiveState };
const state: LiveState = g.__qpListen ?? (g.__qpListen = { channels: new Map(), connected: false });

function deliver(channel: string, payload: unknown) {
  state.channels.get(channel)?.forEach((h) => { try { h(payload); } catch { /* one bad handler must not starve the rest */ } });
}

async function connect() {
  if (state.connected || state.connecting) return state.connecting;
  state.connecting = (async () => {
    try {
      const client = new Client({ connectionString: directUrl(), ssl: true });
      client.on('notification', (msg) => {
        if (!msg.payload) return;
        try { deliver(msg.channel, JSON.parse(msg.payload)); } catch { /* ignore malformed */ }
      });
      const drop = () => {
        state.connected = false;
        state.client = undefined;
        if (state.channels.size && !state.retry) state.retry = setTimeout(() => { state.retry = undefined; void connect(); }, 3000);
      };
      client.on('error', drop);
      client.on('end', drop);
      await client.connect();
      for (const ch of state.channels.keys()) await client.query(`LISTEN ${ch}`);
      state.client = client;
      state.connected = true;
    } catch {
      state.connected = false;
      if (!state.retry) state.retry = setTimeout(() => { state.retry = undefined; void connect(); }, 5000);
    } finally {
      state.connecting = undefined;
    }
  })();
  return state.connecting;
}

const CHANNEL = /^qp_[a-z_]+$/;

/** One LISTEN connection per process (direct endpoint), shared by every channel. */
export async function listen(channel: string, fn: Handler): Promise<() => void> {
  if (!CHANNEL.test(channel)) throw new Error('bad channel');
  const isNew = !state.channels.has(channel);
  const set = state.channels.get(channel) ?? new Set<Handler>();
  set.add(fn);
  state.channels.set(channel, set);
  await connect();
  if (isNew && state.connected) await state.client?.query(`LISTEN ${channel}`).catch(() => {});
  return () => { set.delete(fn); };
}

export function subscribe(fn: (p: LivePayload) => void): Promise<() => void> {
  return listen('qp_live', (p) => fn(p as LivePayload));
}

export function liveConnected() {
  return state.connected;
}

/** NOTIFYs every server instance; if Postgres is unreachable, this instance's subscribers still get it. */
export async function broadcast(p: LivePayload): Promise<void> {
  await notify('qp_live', p).catch(() => deliver('qp_live', p));
}
