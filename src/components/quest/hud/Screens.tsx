'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { CREW } from '@/lib/quest/crew';
import { islandIds, islandMeta } from '@/lib/quest/islands';
import { Portrait } from './Panels';

export function TitleScreen({ ready, error, agents, onStart, onRetry, onExit }: {
  ready: boolean; error?: string; agents?: { available: boolean; reason?: string }; onStart: () => void; onRetry: () => void; onExit?: () => void;
}) {
  const ids = ready ? islandIds() : [];
  const playable = ready && ids.length > 0;
  useEffect(() => {
    if (!playable) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [playable, onStart]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-slate-950/95 via-slate-950/88 to-sky-950/90 backdrop-blur-[2px] pointer-events-auto qp-scanlines">
      <div className="text-center px-6">
        <div className="font-pixel text-[10px] tracking-[0.4em] text-amber-400/80">A MULTI-AGENT DATA DETECTIVE GAME</div>
        <h1 className="font-pixel text-[64px] leading-none text-white mt-3 drop-shadow-[0_4px_0_#b45309]">QUERY<span className="text-amber-400">PILOT</span></h1>
        <div className="font-pixel text-[13px] text-sky-200 mt-2 tracking-widest">SCHEMA CITY</div>

        <div className="flex justify-center gap-3 mt-8">
          {CREW.map((c) => (
            <div key={c.id} className="flex flex-col items-center w-[92px]">
              <Portrait id={c.id} size={64} ring={c.color} />
              <div className="font-pixel text-[9px] mt-1.5" style={{ color: c.color }}>{c.name.split(' ')[1]}</div>
              <div className="font-pixel text-[7px] text-slate-400">{c.role}</div>
            </div>
          ))}
        </div>

        <div className="max-w-[600px] mx-auto mt-6 text-[12px] font-mono text-slate-300 leading-relaxed">
          {ids.length > 0 && <>
            {ids.length === 1 ? 'Your island: ' : `Your ${ids.length} most recent uploads, one island each: `}
            {ids.map((id, i) => (
              <React.Fragment key={id}>
                <span style={{ color: islandMeta(id).color }}>{islandMeta(id).name}</span>{i < ids.length - 1 ? ', ' : '. '}
              </React.Fragment>
            ))}
          </>}
          Every building is a table and every house is a row of your real data. Give an order and the crew maps the city,
          catches dirty data, writes read-only SQL, verifies it, and only then answers. When the data can&apos;t support an answer, they say so.
        </div>

        <div className="mt-6 text-[11px] font-mono">
          {!ready && !error && <span className="text-slate-400 qp-blink">Surveying the islands…</span>}
          {error && (
            <span className="text-red-300">World failed to load: {error} <button className="qp-btn text-[10px] px-2 py-0.5 ml-2" onClick={onRetry}>Retry</button></span>
          )}
          {ready && !ids.length && <span className="text-amber-300">No islands yet. Upload a CSV on the dashboard and it rises from the sea here.</span>}
          {playable && (agents?.available
            ? <span className="text-emerald-300">Crew online and ready for orders.</span>
            : <span className="text-rose-300">Crew offline: {agents?.reason ?? 'try again in a minute.'} The crew cannot answer questions until it is back.</span>)}
        </div>

        {playable && (
          <button onClick={onStart} className="mt-8 font-pixel text-[18px] text-amber-300 qp-blink tracking-[0.3em] hover:text-white">
            ▶ PRESS ENTER
          </button>
        )}
        <div className="mt-6">
          {onExit
            ? <button onClick={onExit} className="font-mono text-[11px] text-sky-300 hover:text-white underline underline-offset-4">← Back to the analyst dashboard</button>
            : <Link href="/" className="font-mono text-[11px] text-sky-300 hover:text-white underline underline-offset-4">← Back to the analyst dashboard</Link>}
        </div>
      </div>
    </div>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Enter', 'Focus the order box / dispatch'],
    ['T', 'Give an order by voice (tap again to stop)'],
    ['I', 'Fly to the next island'],
    ['O', 'Overview: all islands'],
    ['Y / N', 'Stamp or deny an SQL permit'],
    ['X', 'Halt the current mission'],
    ['1 – 6', 'Follow a crew member (again to stop)'],
    ['W A S D / Arrows', 'Pan the camera'],
    ['Drag · Wheel · + / −', 'Pan and zoom'],
    ['Click building', 'Table dossier · house = its rows · City Hall = archive'],
    ['Tab', 'Cycle through mapped districts'],
    ['C', 'Center on City Hall'],
    ['V', 'Reopen the last verdict'],
    ['R', 'Replay the last mission (from stored events)'],
    ['L', 'Toggle building labels'],
    ['M', 'Mute / unmute'],
    ['H', 'How it works (plain language + voice)'],
    ['?', 'This help'],
    ['Esc', 'Close panels'],
  ];
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 pointer-events-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qp-panel w-[520px] qp-rise">
        <div className="qp-header">Controls<button className="ml-auto qp-btn text-[9px] px-2 py-0.5" onClick={onClose}>Close</button></div>
        <div className="p-4 grid grid-cols-[150px_1fr] gap-y-1.5 text-[11px] font-mono">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="font-pixel text-[9px] text-amber-300">{k}</span>
              <span className="text-slate-200">{v}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="px-4 pb-4 text-[10.5px] font-mono text-slate-400 leading-relaxed">
          Every animation is a real backend event: a walking Scout is a real table read, a red flash is a real failed check, a permit is a real pending SQL execution.
          Agent SQL runs inside read-only transactions and every statement is safety-checked. Missions are stored and streamed live to every open tab.
        </div>
      </div>
    </div>
  );
}
