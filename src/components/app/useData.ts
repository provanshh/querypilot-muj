'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DatasetSummary, datasetDetail } from '@/server/engine/summary';
import type { TableCompare } from '@/server/engine/compare';

export type { DatasetSummary, TableCompare };
export type DatasetDetail = Awaited<ReturnType<typeof datasetDetail>>;

export interface RunRow {
  id: string;
  island: string;
  question: string;
  status: string;
  answer: string | null;
  engine: string | null;
  started_at: string;
  finished_at: string | null;
  events: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j as T;
}

export function useDatasets() {
  const [datasets, setDatasets] = useState<DatasetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const j = await getJson<{ datasets: DatasetSummary[] }>('/api/datasets');
      setDatasets(j.datasets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => {
    // Initial load; the setState happens after the network round-trip.
     
    void reload();
  }, [reload]);
  return { datasets, error, reload };
}

const detailCache = new Map<string, DatasetDetail>();

export function useDetail(id: string | undefined) {
  const [detail, setDetail] = useState<DatasetDetail | null>(id ? detailCache.get(id) ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState(id);
  if (loadedId !== id) {
    setLoadedId(id);
    setDetail(id ? detailCache.get(id) ?? null : null);
    setError(null);
  }
  useEffect(() => {
    if (!id || detailCache.has(id)) return;
    let alive = true;
    getJson<DatasetDetail>(`/api/datasets/${id}?verify=1`)
      .then((d) => { detailCache.set(id, d); if (alive) setDetail(d); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, [id]);
  return { detail, error };
}

export function useCompare(id: string | undefined, table: string | undefined, filter: 'changed' | 'dropped' | 'all') {
  const key = id && table ? `${id}|${table}|${filter}` : '';
  const [state, setState] = useState<{ key: string; data: TableCompare | null; error: string | null }>({ key: '', data: null, error: null });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    getJson<TableCompare>(`/api/datasets/${id}/compare?table=${encodeURIComponent(table!)}&filter=${filter}&limit=60`)
      .then((data) => { if (alive) setState({ key, data, error: null }); })
      .catch((err) => { if (alive) setState({ key, data: null, error: err instanceof Error ? err.message : String(err) }); });
    return () => { alive = false; };
  }, [key, id, table, filter]);
  return state.key === key ? state : { key, data: null, error: null };
}

export function useRuns(refreshKey: unknown) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    getJson<{ runs: RunRow[] }>('/api/runs?limit=40').then((j) => { if (alive) setRuns(j.runs); }).catch(() => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  return runs;
}

export function invalidateDetail(id: string) {
  detailCache.delete(id);
}
