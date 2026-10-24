'use client';

import { useState } from 'react';
import { Mic, MicOff, Square, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceState {
  supported: { input: boolean; output: boolean };
  listening: boolean;
  interim: string;
  listen: () => void;
  speakOn: boolean;
  toggleSpeak: () => void;
  speaking: boolean;
  stopSpeaking: () => void;
}

const EXAMPLES = ['“Run an audit”', '“Which category has the most rows?”', '“Show old vs new”', '“Read the answer”', '“Stop”', '“Open the game”'];

/** Floating voice control: tap (or press V) to talk to the agents; answers to spoken questions are read back. */
export function VoiceDock({ voice, running, suggestion }: { voice: VoiceState; running: boolean; suggestion?: string }) {
  const [help, setHelp] = useState(false);
  const panel = voice.listening || voice.speaking || help;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {panel && (
        <div className="pointer-events-auto w-[320px] overflow-hidden rounded-[26px] bg-[#1d1d1f] p-4 text-white shadow-[0_30px_60px_-20px_rgba(29,29,31,0.7)] animate-in fade-in slide-in-from-bottom-3 zoom-in-95 duration-300">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', voice.listening ? 'animate-pulse bg-[#d6f26a]' : voice.speaking ? 'animate-pulse bg-[#b9aaf6]' : 'bg-white/30')} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">
              {voice.listening ? 'Listening' : voice.speaking ? 'Speaking' : 'Voice commands'}
            </span>
            <button onClick={() => { if (voice.listening) voice.listen(); if (voice.speaking) voice.stopSpeaking(); setHelp(false); }} className="ml-auto grid h-7 w-7 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {(voice.listening || voice.speaking) && (
            <div className={cn('qp-voice-wave mt-4 flex h-10 items-center justify-center gap-1.5', voice.listening ? 'text-[#d6f26a]' : 'text-[#b9aaf6]')}>
              <span /><span /><span /><span /><span /><span /><span />
            </div>
          )}

          {voice.listening && (
            <p className="mt-3 min-h-[44px] text-center text-[16px] font-medium leading-snug">
              {voice.interim ? `“${voice.interim}”` : <span className="text-white/40">Ask a question or give a command…</span>}
            </p>
          )}

          {voice.speaking && (
            <button onClick={voice.stopSpeaking} className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[12.5px] font-semibold transition-all hover:bg-white/20 active:scale-95">
              <Square className="h-3 w-3" /> Stop speaking
            </button>
          )}

          {!voice.supported.input && (
            <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-white/[0.06] p-3 text-[12.5px] leading-snug text-white/80">
              <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-[#d6f26a]" />
              <span>This browser has no speech recognition. Open QueryPilot in <b className="text-white">Chrome, Edge or Safari</b> to ask by voice. Spoken answers still work here.</span>
            </div>
          )}

          {!voice.speaking && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-[11px] font-semibold text-white/40">Try saying</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(suggestion ? [`“${suggestion}”`, ...EXAMPLES.slice(0, 4)] : EXAMPLES).map((e) => (
                  <span key={e} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11.5px] text-white/75 transition-colors hover:bg-[#d6f26a] hover:text-[#1d1d1f]">{e}</span>
                ))}
              </div>
            </div>
          )}

          {voice.supported.output && (
            <button onClick={voice.toggleSpeak} className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-white/[0.05] px-3 py-2 text-left text-[12px] transition-colors hover:bg-white/10">
              {voice.speakOn ? <Volume2 className="h-4 w-4 text-[#d6f26a]" /> : <VolumeX className="h-4 w-4 text-white/50" />}
              <span className="flex-1">{voice.speakOn ? 'Reading every answer aloud' : 'Only answers to spoken questions are read aloud'}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold', voice.speakOn ? 'bg-[#d6f26a] text-[#1d1d1f]' : 'bg-white/10 text-white/60')}>{voice.speakOn ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>
      )}

      <div className="pointer-events-auto group relative flex items-center gap-2">
        {!panel && (
          <button
            onClick={() => setHelp(true)}
            className="translate-x-2 rounded-full bg-[#1d1d1f] px-3.5 py-2 text-[12px] font-semibold text-white opacity-0 shadow-lg transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
          >
            {voice.supported.input ? <>Talk to the agents <kbd className="ml-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[10.5px]">V</kbd></> : 'Voice needs Chrome or Edge'}
          </button>
        )}
        <button
          onClick={voice.supported.input ? voice.listen : () => setHelp((h) => !h)}
          aria-label={voice.listening ? 'Stop listening' : 'Ask the agents by voice'}
          className={cn(
            'relative grid h-16 w-16 place-items-center rounded-full shadow-[0_18px_36px_-12px_rgba(29,29,31,0.6)] transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1.3)] active:scale-90 disabled:opacity-50',
            voice.listening ? 'scale-110 bg-[#d6f26a] text-[#1d1d1f]' : 'bg-[#1d1d1f] text-[#d6f26a] hover:-translate-y-1 hover:scale-105 hover:rotate-[-6deg]',
          )}
        >
          {voice.listening && (
            <>
              <span className="qp-ring absolute inset-0 rounded-full bg-[#d6f26a]" />
              <span className="qp-ring-2 absolute inset-0 rounded-full bg-[#d6f26a]" />
            </>
          )}
          {running && !voice.listening && <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-pulse rounded-full bg-[#b9aaf6] ring-4 ring-[#ebebeb]" />}
          <span className="relative">{voice.supported.input ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}</span>
        </button>
      </div>
    </div>
  );
}
