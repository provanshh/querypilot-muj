'use client';

import { History } from 'lucide-react';
import { Card, CardHeader } from '../ui';
import type { DatasetSummary, RunRow } from '../useData';
import { RunsTable } from './OverviewView';

export function HistoryView({ runs, datasets, onOpenRun }: { runs: RunRow[] | null; datasets: DatasetSummary[]; onOpenRun: (r: RunRow) => void }) {
  return (
    <Card>
      <CardHeader icon={<History className="h-4 w-4" />} title="Run history" subtitle="Every run is stored event by event. Open one to replay exactly what each agent did." />
      <RunsTable runs={runs} datasets={datasets} onOpen={onOpenRun} />
    </Card>
  );
}
