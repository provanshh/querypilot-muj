'use client';

import { useEffect, useRef, useState } from 'react';

export interface LivePayload {
  run_id: string;
  island: string;
  seq: number;
  type: string;
  agent_id?: string;
  summary: string;
  ts: string;
  question?: string;
  source?: string;
  mode?: 'ask' | 'audit';
  dataset?: string;
}

/** Every event from every surface (dashboard, game, Telegram), pushed over SSE. */
export function useLiveFeed(onEvent: (p: LivePayload) => void) {
  const ref = useRef(onEvent);
  const [connected, setConnected] = useState(false);
  useEffect(() => { ref.current = onEvent; }, [onEvent]);
  useEffect(() => {
    const es = new EventSource('/api/live');
    es.addEventListener('hello', () => setConnected(true));
    es.addEventListener('mission', (ev) => {
      try { ref.current(JSON.parse((ev as MessageEvent).data) as LivePayload); } catch { /* malformed */ }
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);
  return connected;
}
