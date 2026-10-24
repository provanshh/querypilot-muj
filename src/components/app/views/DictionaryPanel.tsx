'use client';

import { useEffect, useState } from 'react';
import { BookOpenText, Check, Loader2, Plus, Scale, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DictionaryView } from '@/server/datasets/dictionary';
import { Badge, Button, Card, CardHeader } from '../ui';

interface ColumnForm { name: string; role: string; cleanType: string; sample: string[]; desc: string; synonyms: string; codes: string }
interface TableForm { name: string; rows: number; desc: string; synonyms: string; columns: ColumnForm[] }

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const codesOf = (s: string) => Object.fromEntries(list(s).map((p) => p.split('=').map((x) => x.trim())).filter((kv) => kv.length === 2 && kv[0] && kv[1]));
const codesText = (v?: Record<string, string>) => Object.entries(v ?? {}).map(([k, x]) => `${k}=${x}`).join(', ');

function toForm(v: DictionaryView): { rules: string[]; tables: TableForm[] } {
  return {
    rules: v.rules,
    tables: v.tables.map((t) => ({
      name: t.name, rows: t.rows, desc: t.desc ?? '', synonyms: (t.synonyms ?? []).join(', '),
      columns: t.columns.map((c) => ({ name: c.name, role: c.role, cleanType: c.cleanType, sample: c.sample, desc: c.desc ?? '', synonyms: (c.synonyms ?? []).join(', '), codes: codesText(c.values) })),
    })),
  };
}

/** Uses the column's own short values when they look like codes; otherwise just the format. */
const codeHint = (sample: string[], role: string) => {
  const short = role === 'category' ? sample.filter((s) => s.length <= 4 && !/^[\d.,\s/-]+$/.test(s) && !/^n\/?a$/i.test(s)).slice(0, 2) : [];
  return short.length ? `${short.map((s) => `${s}=…`).join(', ')}` : 'code=meaning, …';
};

const field = 'w-full rounded-xl bg-[#f4f4f4] px-3 py-2 text-[12.5px] text-[#1d1d1f] outline-none transition-shadow placeholder:text-black/30 focus:bg-white focus:shadow-[0_0_0_3px_rgba(185,170,246,0.45)]';

/** The owner's knowledge about a dataset: column meanings, other names, code values and business rules. */
export function DictionaryPanel({ datasetId, datasetName, onSaved }: { datasetId: string; datasetName: string; onSaved?: () => void }) {
  const [form, setForm] = useState<{ rules: string[]; tables: TableForm[] } | null>(null);
  const [draftRule, setDraftRule] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text?: string }>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/datasets/${datasetId}/dictionary`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Could not load the dictionary'); return j as DictionaryView; })
      .then((v) => { if (alive) setForm(toForm(v)); })
      .catch((err) => { if (alive) setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) }); });
    return () => { alive = false; };
  }, [datasetId]);

  const edit = (fn: (f: { rules: string[]; tables: TableForm[] }) => void) => {
    setForm((f) => { if (!f) return f; const next = structuredClone(f); fn(next); return next; });
    setDirty(true);
    if (status.kind !== 'saving') setStatus({ kind: 'idle' });
  };

  const addRule = () => {
    const r = draftRule.trim();
    if (!r) return;
    edit((f) => { f.rules.push(r); });
    setDraftRule('');
  };

  const save = async () => {
    if (!form) return;
    const rules = draftRule.trim() ? [...form.rules, draftRule.trim()] : form.rules;
    setStatus({ kind: 'saving' });
    try {
      const res = await fetch(`/api/datasets/${datasetId}/dictionary`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rules,
          tables: Object.fromEntries(form.tables.map((t) => [t.name, {
            desc: t.desc, synonyms: list(t.synonyms),
            columns: Object.fromEntries(t.columns.map((c) => [c.name, { desc: c.desc, synonyms: list(c.synonyms), values: codesOf(c.codes) }])),
          }])),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Save failed');
      setForm(toForm(j as DictionaryView));
      setDraftRule('');
      setDirty(false);
      setStatus({ kind: 'saved', text: 'Saved. The agents use it from the next question.' });
      onSaved?.();
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const documented = form?.tables.reduce((s, t) => s + t.columns.filter((c) => c.desc || c.synonyms || c.codes).length, 0) ?? 0;
  const total = form?.tables.reduce((s, t) => s + t.columns.length, 0) ?? 0;

  return (
    <Card>
      <CardHeader
        icon={<BookOpenText className="h-4 w-4" />}
        title={<>Data dictionary &amp; business rules <span className="font-normal text-black/40">· {datasetName}</span></>}
        subtitle="Knowledge the data can't carry by itself. The agents read it on every question and cite the rules they apply. Nothing here is guessed: you write it."
        action={form && <Badge tone={documented ? 'green' : 'slate'}>{documented}/{total} columns documented · {form.rules.length} rules</Badge>}
      />
      <div className="space-y-5 px-5 pb-5">
        {!form && status.kind !== 'error' && <div className="flex items-center gap-2 text-[12.5px] text-black/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading dictionary…</div>}

        {form && (
          <>
            <section>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Scale className="h-4 w-4" /> Business rules</div>
              <p className="mb-2 text-[12px] text-black/45">Definitions and exclusions the SQL must follow, e.g. <i>&quot;Revenue excludes refunded orders&quot;</i> or <i>&quot;The fiscal year starts on 1 April&quot;</i>.</p>
              <ol className="space-y-1.5">
                {form.rules.map((r, i) => (
                  <li key={i} className="group flex items-center gap-2">
                    <span className="grid h-7 w-9 shrink-0 place-items-center rounded-lg bg-[#ece8fd] text-[11px] font-bold text-[#4b3fb0]">R{i + 1}</span>
                    <input value={r} maxLength={300} aria-label={`Business rule ${i + 1}`} onChange={(e) => edit((f) => { f.rules[i] = e.target.value; })} className={field} />
                    <button type="button" aria-label={`Remove rule ${i + 1}`} onClick={() => edit((f) => { f.rules.splice(i, 1); })} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-black/35 transition hover:bg-rose-50 hover:text-rose-600">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex gap-2">
                <input
                  value={draftRule} maxLength={300} placeholder="Add a rule…" aria-label="New business rule"
                  onChange={(e) => { setDraftRule(e.target.value); setDirty(true); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
                  className={field}
                />
                <Button variant="ghost" onClick={addRule} disabled={!draftRule.trim() || form.rules.length >= 20}><Plus className="h-4 w-4" /> Add</Button>
              </div>
            </section>

            {form.tables.map((t, ti) => (
              <section key={t.name}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  <code className="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[12px]">{t.name}</code>
                  <span className="text-[12px] font-normal text-black/40">{t.rows.toLocaleString()} rows</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={t.desc} maxLength={300} aria-label={`${t.name} description`} placeholder="What one row of this table is" onChange={(e) => edit((f) => { f.tables[ti].desc = e.target.value; })} className={field} />
                  <input value={t.synonyms} aria-label={`${t.name} other names`} placeholder="Other names, comma separated" onChange={(e) => edit((f) => { f.tables[ti].synonyms = e.target.value; })} className={field} />
                </div>
                <div className="mt-3 max-h-[440px] overflow-auto rounded-2xl ring-1 ring-black/[0.06]">
                  <table className="w-full text-left text-[12px]">
                    <thead className="sticky top-0 z-10 bg-white/95 text-[11px] uppercase tracking-wide text-black/40 backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Column &amp; real values</th>
                        <th className="px-2 py-2 font-semibold">Meaning</th>
                        <th className="px-2 py-2 font-semibold">Also called</th>
                        <th className="px-2 py-2 font-semibold">Codes (A=Active, …)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.columns.map((c, ci) => (
                        <tr key={c.name} className="border-t border-black/[0.05] align-top transition-colors hover:bg-[#fafaf7]">
                          <td className="w-[30%] px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <code className="font-semibold">{c.name}</code>
                              {(c.desc || c.synonyms || c.codes) && <Check className="h-3.5 w-3.5 text-[#5f8a00]" />}
                            </div>
                            <div className="mt-0.5 text-[10.5px] text-black/40">{c.role} · {c.cleanType}</div>
                            {c.sample.length > 0 && <div className="mt-1 line-clamp-2 text-[10.5px] text-black/45">{c.sample.join(' · ')}</div>}
                          </td>
                          <td className="px-2 py-2"><input value={c.desc} maxLength={300} aria-label={`${c.name} meaning`} placeholder={`What ${c.name.replace(/_/g, ' ')} means`} onChange={(e) => edit((f) => { f.tables[ti].columns[ci].desc = e.target.value; })} className={field} /></td>
                          <td className="px-2 py-2"><input value={c.synonyms} aria-label={`${c.name} other names`} placeholder="Other names, comma separated" onChange={(e) => edit((f) => { f.tables[ti].columns[ci].synonyms = e.target.value; })} className={field} /></td>
                          <td className="px-2 py-2"><input value={c.codes} aria-label={`${c.name} codes`} placeholder={codeHint(c.sample, c.role)} onChange={(e) => edit((f) => { f.tables[ti].columns[ci].codes = e.target.value; })} className={field} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} disabled={!form || status.kind === 'saving' || !dirty}>
            {status.kind === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save knowledge
          </Button>
          {status.text && (
            <span className={cn('text-[12.5px]', status.kind === 'error' ? 'text-rose-600' : 'text-[#4d6f00]')}>{status.text}</span>
          )}
          {!status.text && dirty && <span className="text-[12.5px] text-black/45">Unsaved changes</span>}
        </div>
      </div>
    </Card>
  );
}
