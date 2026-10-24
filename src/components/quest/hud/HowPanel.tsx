'use client';

import React, { useState } from 'react';
import { CREW } from '@/lib/quest/crew';
import { voice } from '@/lib/quest/narrator';
import { islandMeta } from '@/lib/quest/islands';
import { Portrait } from './Panels';

const SIMPLE_ROLES: Record<string, string> = {
  mayor: 'You. You ask the question, and you can approve or refuse each database query.',
  scout: 'Walks the city to find which tables (buildings) exist and how they connect.',
  inspector: 'Looks inside the tables for messy data: duplicates, "N/A" values, odd year formats.',
  engineer: 'Writes the database query (SQL) that should produce the answer.',
  verifier: 'The skeptic. Re-checks every result and sends broken queries back for repair.',
  analyst: 'Turns the verified rows into a plain answer, or honestly refuses if the data can\'t say.',
};

const EXPLAINER = [
  'This is a game about an AI team that answers questions from a database.',
  'Each island is one of the CSV files you uploaded, kept exactly as written.',
  'Real exports are messy: duplicates, placeholders instead of blanks, amounts written as text, mixed date formats and spelling variants.',
  'Every building is a table of data, and every house is a row. Click any of them to look inside.',
  'When you ask a question, six crew members walk around the island doing their jobs. Every step you see is a real step happening on your real data.',
  'The first query usually breaks or gives a wrong answer on messy data. Watch the Verifier catch it and the Engineer fix it.',
  'Planes carry each finding out over the sea, so you can see the crew\'s progress at a glance.',
  'If a question can\'t be answered from the data, the right move is to refuse. That counts as a win.',
];

export interface NarratorLine { id: string; text: string; island: string; at: number }

export function HowButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`qp-btn text-[11px] px-3 py-1.5 ${open ? '!bg-sky-400 !text-slate-900 !border-sky-200' : '!border-sky-400 !text-sky-200'}`} title="How does this work? (plain language, with voice)">
      ? HOW <span className="qp-key ml-1">H</span>
    </button>
  );
}

export function HowPanel({ lines, onClose, voiceOn, setVoiceOn }: {
  lines: NarratorLine[]; onClose: () => void; voiceOn: boolean; setVoiceOn: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<'live' | 'basics' | 'crew'>(lines.length ? 'live' : 'basics');
  const supported = voice.supported();
  const readAloud = () => voice.say(EXPLAINER.join(' '), { force: true, interrupt: true });

  return (
    <div className="qp-panel w-[380px] pointer-events-auto qp-rise flex flex-col max-h-[calc(100vh-170px)]">
      <div className="qp-header">
        <span className="text-sky-300">?</span> How it works
        <span className="text-[9px] text-slate-400 ml-1">plain language</span>
        <button className="ml-auto qp-btn text-[9px] px-2 py-0.5" onClick={onClose}>Close</button>
      </div>
      <div className="flex gap-1 px-3 pt-2">
        {(['live', 'basics', 'crew'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`qp-btn text-[9px] px-2 py-1 ${tab === t ? '!bg-sky-400 !text-slate-900' : ''}`}>
            {t === 'live' ? 'Live narrator' : t === 'basics' ? 'The basics' : 'Who does what'}
          </button>
        ))}
      </div>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-700/60">
        <button
          disabled={!supported}
          onClick={() => { const v = !voiceOn; setVoiceOn(v); if (v) voice.say('Voice mode on. I will explain what the crew is doing.', { force: true, interrupt: true }); }}
          className={`qp-btn text-[10px] px-2.5 py-1 ${voiceOn ? '!bg-emerald-500 !text-slate-900 !border-emerald-300' : ''}`}
        >
          {voiceOn ? '🔊 Voice on' : '🔈 Voice off'}
        </button>
        <button disabled={!supported} className="qp-btn text-[10px] px-2.5 py-1" onClick={readAloud}>Read basics aloud</button>
        <button disabled={!supported} className="qp-btn text-[10px] px-2 py-1" onClick={() => voice.stop()}>Stop</button>
        {!supported && <span className="text-[9px] font-mono text-slate-500">Voice not supported in this browser</span>}
      </div>
      <div className="flex-1 overflow-y-auto qp-scroll px-3 py-2.5">
        {tab === 'live' && (
          <div className="space-y-2">
            {!lines.length && <div className="text-[11px] font-mono text-slate-400">Nothing happening yet. Type a question, and I&apos;ll explain each step here in plain words.</div>}
            {[...lines].reverse().map((l, i) => (
              <div key={l.id} className={`text-[11.5px] font-mono leading-snug ${i === 0 ? 'text-white' : 'text-slate-400'}`}>
                <span className="font-pixel text-[8px] mr-1.5" style={{ color: islandMeta(l.island).color }}>{islandMeta(l.island).short.toUpperCase()}</span>
                {l.text}
              </div>
            ))}
          </div>
        )}
        {tab === 'basics' && (
          <ol className="space-y-2 list-decimal pl-4">
            {EXPLAINER.map((t) => <li key={t} className="text-[11.5px] font-mono text-slate-200 leading-snug">{t}</li>)}
          </ol>
        )}
        {tab === 'crew' && (
          <div className="space-y-2">
            {CREW.map((c) => (
              <div key={c.id} className="flex gap-2 items-start">
                <Portrait id={c.id} size={34} ring={c.color} />
                <div>
                  <div className="font-pixel text-[9px]" style={{ color: c.color }}>{c.name} · {c.role}</div>
                  <div className="text-[11px] font-mono text-slate-200 leading-snug">{SIMPLE_ROLES[c.id]}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
