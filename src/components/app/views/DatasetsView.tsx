'use client';

import { useRef, useState } from 'react';
import { ArrowRight, ClipboardPaste, FileSpreadsheet, Loader2, ShieldCheck, Table2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME } from '../theme';
import { Badge, Button, Card, CardHeader } from '../ui';
import type { DatasetSummary } from '../useData';
import { DictionaryPanel } from './DictionaryPanel';

export function DatasetCard({ d, active, onOpen, onAudit, onExplore }: { d: DatasetSummary; active?: boolean; onOpen: () => void; onAudit?: () => void; onExplore?: () => void }) {
  const t = THEME;
  const tone = d.score >= 85 ? 'green' : d.score >= 60 ? 'amber' : 'red';
  return (
    <Card interactive onClick={onOpen} className={cn('group overflow-hidden', active && 'ring-2 ring-[#1d1d1f]')}>
      <div className={cn('relative m-2 h-28 overflow-hidden rounded-[20px] transition-colors duration-500', active ? 'bg-[#1d1d1f]' : 'bg-[#b9aaf6] group-hover:bg-[#1d1d1f]')}>
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:14px_14px]" />
        <span className="qp-float absolute right-6 top-4 h-10 w-10 rounded-full bg-[#d6f26a] transition-transform duration-500 group-hover:scale-125" />
        <span className="absolute right-16 top-12 h-6 w-6 rounded-full bg-white/50 transition-transform duration-500 group-hover:translate-x-3" />
        <t.icon className="absolute -bottom-4 right-2 h-24 w-24 text-white/15 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" />
        <div className={cn('absolute left-4 top-3 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors duration-500', active ? 'text-white/60' : 'text-black/50 group-hover:text-white/60')}>{active ? 'Active dataset' : 'Uploaded'}</div>
        <div className={cn('absolute bottom-3 left-4 right-4 flex items-center gap-2 transition-colors duration-500', active ? 'text-white' : 'text-[#1d1d1f] group-hover:text-white')}>
          <t.icon className="h-5 w-5 shrink-0" />
          <span className="truncate text-[16px] font-semibold tracking-tight">{d.name}</span>
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        {d.createdAt && <div className="text-[12px] text-black/45">Uploaded {new Date(d.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>}
        <div className="mt-2.5 flex items-center gap-2">
          <Badge tone={tone} dot>Clarity {d.score}/100: {d.grade}</Badge>
          {d.error && <Badge tone="red">unavailable</Badge>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['Tables', d.tables.length],
            ['Rows', d.rows.toLocaleString()],
            ['Problems', d.issues.high + d.issues.medium + d.issues.low],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-[#f4f4f4] py-2.5 transition-colors duration-300 group-hover:bg-[#eef9c8]">
              <div className="text-[16px] font-semibold tabular-nums">{v}</div>
              <div className="text-[11px] text-black/45">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1d1d1f] transition-all duration-300 group-hover:gap-2">Open <ArrowRight className="h-3.5 w-3.5" /></span>
          {onExplore && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={(e) => { e.stopPropagation(); onExplore(); }}>
              <Table2 className="h-3.5 w-3.5" /> View data
            </Button>
          )}
          {onAudit && (
            <Button size="sm" variant="ghost" className={onExplore ? '' : 'ml-auto'} onClick={(e) => { e.stopPropagation(); onAudit(); }}>
              <ShieldCheck className="h-3.5 w-3.5" /> Audit
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function UploadPanel({ onUploaded }: { onUploaded: (id: string) => void }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const send = async (body: FormData | { name: string; csv: string }, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch('/api/datasets/upload', body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Upload failed');
      onUploaded(j.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const sendFile = (f: File) => {
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) { setError('Please choose a .csv file.'); return; }
    const fd = new FormData();
    fd.append('file', f);
    void send(fd, `Uploading ${f.name}…`);
  };

  return (
    <Card>
      <CardHeader icon={<UploadCloud className="h-4 w-4" />} title="Upload an unclear dataset" subtitle="CSV up to 2 MB / 5,000 rows. It gets its own isolated schema; the agents then audit it and answer questions about it." />
      <div className="px-5 pb-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) sendFile(f); }}
          onClick={() => !busy && input.current?.click()}
          className={cn(
            'group flex cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-6 py-10 text-center transition-all duration-300',
            drag ? 'scale-[1.01] border-[#9cc92a] bg-[#eef9c8]' : 'border-black/10 bg-[#f6f6f6] hover:border-[#b9aaf6] hover:bg-[#f3f0fe]',
          )}
        >
          <span className={cn('grid h-14 w-14 place-items-center rounded-full transition-all duration-500 ease-[cubic-bezier(.2,.9,.3,1.3)]', drag ? 'scale-110 bg-[#d6f26a]' : 'bg-white group-hover:-translate-y-1 group-hover:rotate-[-8deg] group-hover:bg-[#d6f26a]')}>
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
          </span>
          <div className="mt-3 text-[15px] font-semibold">{busy ?? (drag ? 'Drop to upload' : 'Drag a CSV here, or click to choose')}</div>
          <div className="mt-0.5 text-[12px] text-black/45">Comma, semicolon or tab separated. Headers become column names.</div>
          <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ''; }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setPaste((p) => !p)} disabled={!!busy}><ClipboardPaste className="h-4 w-4" /> Paste CSV</Button>
        </div>
        {paste && (
          <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste CSV text here. The first line holds the column names."
              className="w-full rounded-[20px] bg-[#f4f4f4] p-3.5 font-mono text-[12px] text-[#1d1d1f] outline-none transition-shadow focus:bg-white focus:shadow-[0_0_0_4px_rgba(185,170,246,0.45)]"
            />
            <Button variant="primary" className="mt-2" disabled={!text.trim() || !!busy} onClick={() => send({ name: 'pasted.csv', csv: text }, 'Uploading pasted data…')}>Upload pasted data</Button>
          </div>
        )}
        {error && <div className="mt-3 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700 ring-1 ring-rose-200">{error}</div>}
        <ul className="mt-4 grid gap-2 text-[12px] text-black/50 sm:grid-cols-3">
          {[
            ['Stored as written.', 'Every value is kept as text, exactly like a raw export.', 'bg-[#ece8fd]'],
            ['Audited automatically.', 'You get a clarity score and every problem found.', 'bg-[#eef9c8]'],
            ['Read-only agents.', 'Questions run in read-only transactions.', 'bg-[#f4f4f4]'],
          ].map(([h, b, bg]) => (
            <li key={h} className={cn('rounded-[18px] px-3.5 py-3 transition-transform duration-300 hover:-translate-y-0.5', bg)}><span className="font-semibold text-[#1d1d1f]">{h}</span> {b}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function DatasetsView({ datasets, activeId, onOpen, onAudit, onExplore, onUploaded, onKnowledgeSaved }: {
  datasets: DatasetSummary[];
  activeId: string;
  onOpen: (id: string) => void;
  onAudit: (id: string) => void;
  onExplore: (id: string) => void;
  onUploaded: (id: string) => void;
  onKnowledgeSaved: (id: string) => void;
}) {
  const active = datasets.find((d) => d.id === activeId);
  return (
    <div className="space-y-5">
      <UploadPanel onUploaded={onUploaded} />
      {active && <DictionaryPanel key={active.id} datasetId={active.id} datasetName={active.name} onSaved={() => onKnowledgeSaved(active.id)} />}
      <div>
        <h2 className="px-1 text-[18px] font-semibold tracking-tight">Your datasets</h2>
        {datasets.length ? (
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {datasets.map((d) => <DatasetCard key={d.id} d={d} active={d.id === activeId} onOpen={() => onOpen(d.id)} onAudit={() => onAudit(d.id)} onExplore={() => onExplore(d.id)} />)}
          </div>
        ) : (
          <div className="mt-3 rounded-[26px] border-2 border-dashed border-black/10 px-5 py-8 text-center text-[12.5px] text-black/45">No datasets yet. Upload a CSV above to get started.</div>
        )}
      </div>
    </div>
  );
}
