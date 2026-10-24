'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestEvent, Verdict } from '@/lib/quest/types';

export interface MissionRequest {
  dataset: string;
  mode: 'ask' | 'audit';
  question?: string;
}

export interface Mission {
  id?: string;
  /** Set when the run was started elsewhere (e.g. Telegram) and is being followed live. */
  remote?: string;
  status: 'idle' | 'running' | 'done' | 'error';
  request?: MissionRequest;
  events: QuestEvent[];
  verdict: Verdict | null;
  error?: string;
  startedAt?: number;
}

const IDLE: Mission = { status: 'idle', events: [], verdict: null };

/** Streams one agent run from /api/missions (NDJSON) and folds its events into state. */
export function useMission(onFinish?: (m: Mission) => void) {
  const [mission, setMission] = useState<Mission>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async (req: MissionRequest, pace: 'cinematic' | 'fast' = 'cinematic', source = 'dashboard') => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setMission({ ...IDLE, status: 'running', request: req, startedAt: Date.now() });
    let final: Mission | null = null;
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...req, approval: 'auto', pace, source }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const id = res.headers.get('X-Run-Id') ?? undefined;
      setMission((p) => ({ ...p, id }));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        const batch = lines.filter(Boolean).map((l) => JSON.parse(l) as QuestEvent);
        if (!batch.length) continue;
        setMission((p) => {
          let { verdict, status, error } = p;
          for (const e of batch) {
            if (e.type === 'run.finished') { verdict = (e.metadata?.verdict as Verdict | undefined) ?? verdict; status = 'done'; }
            if (e.type === 'run.error') { status = 'error'; error = e.summary; }
          }
          const next = { ...p, events: [...p.events, ...batch], verdict, status, error };
          if (status !== 'running') final = next;
          return next;
        });
      }
      setMission((p) => (p.status === 'running' ? { ...p, status: 'error', error: 'The run ended without a result.' } : p));
    } catch (err) {
      if (ac.signal.aborted) return;
      setMission((p) => ({ ...p, status: 'error', error: err instanceof Error ? err.message : String(err) }));
    }
    if (final) finishRef.current?.(final);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setMission((p) => (p.status === 'running' ? { ...p, status: 'error', error: 'Stopped.' } : p));
  }, []);
  const reset = useCallback(() => { abortRef.current?.abort(); setMission(IDLE); }, []);

  /** Replays a recorded run: same events, same verdict, straight from the event log. */
  const load = useCallback((id: string, req: MissionRequest, events: QuestEvent[]) => {
    abortRef.current?.abort();
    const fin = events.find((e) => e.type === 'run.finished');
    setMission({ id, status: 'done', request: req, events, verdict: (fin?.metadata?.verdict as Verdict | undefined) ?? null, startedAt: events[0] ? Date.parse(events[0].timestamp) : undefined });
  }, []);

  /** Follows a run started elsewhere: live events arrive via pushRemote, the full log via load(). */
  const follow = useCallback((id: string, req: MissionRequest, source: string) => {
    abortRef.current?.abort();
    setMission({ ...IDLE, id, status: 'running', request: req, startedAt: Date.now(), remote: source });
  }, []);
  const pushRemote = useCallback((id: string, e: QuestEvent) => {
    setMission((p) => (p.id === id && p.status === 'running' ? { ...p, events: [...p.events, e] } : p));
  }, []);

  return { mission, start, stop, reset, load, follow, pushRemote };
}
