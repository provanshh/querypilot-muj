'use client';

import { useEffect, useState } from 'react';

export interface LiveItem {
  run_id: string;
  island: string;
  seq: number;
  type: string;
  agent_id?: string;
  summary: string;
  ts: string;
  question?: string;
}

export interface LiveState {
  connected: boolean;
  /** Cross-process fan-out is active on the server (vs. same-process fallback). */
  pgListen: boolean;
  items: LiveItem[];
  /** Runs seen in the last minute that have not finished. */
  active: Record<string, { island: string; question?: string; last: string; at: number }>;
}

/** Subscribes to the server's live event fan-out over SSE. */
export function useLive(): LiveState {
  const [state, setState] = useState<LiveState>({ connected: false, pgListen: false, items: [], active: {} });

  useEffect(() => {
    const es = new EventSource('/api/live');
    const finished = new Set<string>();
    es.addEventListener('hello', (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as { live: boolean };
      setState((s) => ({ ...s, connected: true, pgListen: d.live }));
    });
    const fresh = (active: LiveState['active']) => {
      const now = Date.now();
      const out = { ...active };
      for (const [k, v] of Object.entries(out)) if (now - v.at > 60_000) delete out[k];
      return out;
    };
    es.addEventListener('ping', (ev) => {
      const d = JSON.parse((ev as MessageEvent).data) as { live: boolean };
      setState((s) => ({ ...s, connected: true, pgListen: d.live, active: fresh(s.active) }));
    });
    es.addEventListener('mission', (ev) => {
      const p = JSON.parse((ev as MessageEvent).data) as LiveItem;
      if (!p.run_id || p.type.startsWith('ui.')) return;
      setState((s) => {
        const active = fresh(s.active);
        const now = Date.now();
        if (p.type === 'run.finished' || p.type === 'run.error') { finished.add(p.run_id); delete active[p.run_id]; }
        else if (!finished.has(p.run_id)) active[p.run_id] = { island: p.island, question: p.question ?? active[p.run_id]?.question, last: p.summary, at: now };
        return { ...s, items: [...s.items.slice(-39), p], active };
      });
    });
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    return () => es.close();
  }, []);

  return state;
}
