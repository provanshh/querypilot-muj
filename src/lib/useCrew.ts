'use client';

import { useEffect, useState } from 'react';
import type { CrewStatus } from '@/lib/quest/types';

/** Polls the worker pool status; `null` until the first reply, `undefined` when it failed. */
export function useCrew(intervalMs = 5000): CrewStatus | null | undefined {
  const [crew, setCrew] = useState<CrewStatus | null | undefined>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/workers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CrewStatus) => { if (alive) setCrew(d); })
      .catch(() => { if (alive) setCrew(undefined); });
    void load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return crew;
}

export const busyCount = (c: CrewStatus) => Object.values(c.queue).reduce((n, q) => n + q.running + q.queued, 0);
