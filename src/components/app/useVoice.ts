'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

/** Browser speech: recognition for voice input, synthesis for spoken answers. Both optional. */
export function useVoice(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState({ input: false, output: false });
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speakOn, setSpeakOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => { finalRef.current = onFinal; }, [onFinal]);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    // Feature detection has to wait for the browser; there is no server equivalent.
     
    setSupported({ input: !!(w.SpeechRecognition ?? w.webkitSpeechRecognition), output: 'speechSynthesis' in window });
    try {
      setSpeakOn(localStorage.getItem('qp.speak') === '1');
    } catch { /* storage blocked */ }
  }, []);

  const listen = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setError('This browser has no speech recognition. Open QueryPilot in Chrome, Edge or Safari to talk to the agents.'); return; }
    if (recRef.current) { recRef.current.stop(); return; }
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i += 1) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      setInterim(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access was blocked. Allow the microphone for this site and try again.'
          : e.error === 'no-speech' ? 'I didn’t hear anything. Tap the mic and speak again.'
            : e.error === 'network' ? 'Speech recognition needs an internet connection (and isn’t available in some browsers, like Brave). Try Chrome or Edge.'
              : e.error === 'audio-capture' ? 'No microphone was found.'
                : `Voice input error: ${e.error}`,
      );
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim('');
      if (finalText.trim()) finalRef.current(finalText.trim());
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, []);

  const speak = useCallback((text: string, force = false) => {
    if (!('speechSynthesis' in window) || (!speakOn && !force)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[`*_#]/g, '').slice(0, 600));
    u.rate = 1.03;
    const voice = window.speechSynthesis.getVoices().find((v) => /en-(US|GB)/.test(v.lang) && /Samantha|Google|Natural|Aria|Jenny/i.test(v.name));
    if (voice) u.voice = voice;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [speakOn]);

  const toggleSpeak = useCallback(() => {
    setSpeakOn((on) => {
      const next = !on;
      try { localStorage.setItem('qp.speak', next ? '1' : '0'); } catch { /* storage blocked */ }
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, listening, interim, listen, speak, speakOn, toggleSpeak, speaking, stopSpeaking, error, clearError: () => setError(null) };
}

type VoiceCommand =
  | { kind: 'dataset'; id: string }
  | { kind: 'audit' }
  | { kind: 'view'; view: string }
  | { kind: 'game'; on: boolean }
  | { kind: 'stop' }
  | { kind: 'repeat' }
  | { kind: 'ask'; question: string };

/** Maps a spoken sentence to an app command; anything unrecognised is treated as a question. */
export function parseVoiceCommand(text: string, datasets: { id: string; name: string }[]): VoiceCommand {
  const t = text.toLowerCase().trim().replace(/[.!?]$/, '').replace(/^(hey |ok |okay )?(query ?pilot|agents|crew)[,:]?\s+/, '');
  if (/^(stop|cancel|halt|abort)( the)?( run| mission| agents| crew| question)?$/.test(t)) return { kind: 'stop' };
  if (/^(read|repeat|say)( me)?( the)?( last)? (answer|result|verdict)( again| aloud)?$/.test(t)) return { kind: 'repeat' };
  const asked = t.match(/^(?:please )?(?:ask|tell me|find out)(?: the)?(?: agents| crew)?(?: to)?[,:]?\s+(.{4,})$/);
  if (asked) return { kind: 'ask', question: asked[1] };
  const ds = t.match(/^(?:switch|change|go|open|use|show)\s+(?:to\s+)?(?:the\s+)?(.+?)(?:\s+(?:data(?:set)?|file))?$/);
  if (ds) {
    const words = ds[1].split(/\s+/);
    const hit = /^(latest|last|newest)/.test(ds[1])
      ? datasets[0]
      : datasets.find((d) => words.every((w) => d.name.toLowerCase().replace(/[_-]/g, ' ').includes(w)));
    if (hit) return { kind: 'dataset', id: hit.id };
  }
  if (/^(run |start |do )?(an? )?(audit|data health|health check|check (the )?data)/.test(t)) return { kind: 'audit' };
  if (/^(open|start|enter|play|show) (the )?game|game mode on/.test(t)) return { kind: 'game', on: true };
  if (/^(close|exit|leave|stop) (the )?game|game mode off|back to (the )?dashboard/.test(t)) return { kind: 'game', on: false };
  if (/^(show |open )?(old vs new|before and after|compare|comparison)/.test(t)) return { kind: 'view', view: 'compare' };
  if (/^(show |open )?(the )?(overview|home|dashboard)$/.test(t)) return { kind: 'view', view: 'overview' };
  if (/^(show |open )?(the )?(upload|datasets?)/.test(t)) return { kind: 'view', view: 'datasets' };
  if (/^(show |open )?(the )?(history|runs)/.test(t)) return { kind: 'view', view: 'history' };
  if (/^(show |open )?(the )?(data )?(explorer|browse( the)? (data|rows))$/.test(t)) return { kind: 'view', view: 'explorer' };
  if (/^(show |open )?(the )?(ask|question) (view|page|screen)$/.test(t)) return { kind: 'view', view: 'ask' };
  return { kind: 'ask', question: text.trim() };
}
