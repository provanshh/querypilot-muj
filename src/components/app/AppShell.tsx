'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight, ChevronDown, Cpu, Database, Gamepad2, GitCompareArrows, History, LayoutDashboard, Loader2, MessageSquareText, Mic, Search, Send, ShieldCheck,
  Table2, UploadCloud, Volume2, VolumeX, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uiEvent } from '@/lib/uiEvent';
import { useLiveFeed, type LivePayload } from './useLiveFeed';
import { ExplorerView } from './views/ExplorerView';
import { THEME } from './theme';
import { Badge, Button } from './ui';
import { useDatasets, useDetail, useRuns, invalidateDetail, type RunRow } from './useData';
import { useMission, type Mission, type MissionRequest } from './useMission';
import { parseVoiceCommand, useVoice } from './useVoice';
import { VoiceDock } from './VoiceDock';
import { LogoMark, Wordmark } from './Logo';
import { AskView } from './views/AskView';
import { AuditView } from './views/AuditView';
import { CompareView } from './views/CompareView';
import { DatasetsView } from './views/DatasetsView';
import { HistoryView } from './views/HistoryView';
import { OverviewView } from './views/OverviewView';
import type { QuestEvent } from '@/lib/quest/types';

const QuestGame = dynamic(() => import('@/components/quest/QuestGame'), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-[#0b1220] font-mono text-sm text-amber-300">Loading the islands…</div>,
});

type View = 'overview' | 'ask' | 'audit' | 'compare' | 'explorer' | 'datasets' | 'history';

const NAV: { id: View; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, hint: 'What problem this solves' },
  { id: 'ask', label: 'Ask the agents', icon: MessageSquareText, hint: 'Plain-English questions' },
  { id: 'audit', label: 'Data health', icon: ShieldCheck, hint: 'Is the data clear?' },
  { id: 'compare', label: 'Old vs new', icon: GitCompareArrows, hint: 'Before and after cleaning' },
  { id: 'explorer', label: 'Data explorer', icon: Table2, hint: 'Browse every row, before and after' },
  { id: 'datasets', label: 'Datasets & upload', icon: Database, hint: 'Your uploaded CSVs' },
  { id: 'history', label: 'History', icon: History, hint: 'Replay any run' },
];

const TITLES: Record<View, [string, string]> = {
  overview: ['Data Overview', 'Ask messy data in plain English, and get a verified answer or an honest no'],
  ask: ['Ask the Agents', 'Type or say a business question; watch the agents explore, clean, query and verify'],
  audit: ['Data Health', 'How clear is this data? What did the agents find and fix?'],
  compare: ['Old vs New', 'The original values next to what the agents read after cleaning'],
  explorer: ['Data Explorer', 'Every row of every table: as stored and after cleaning'],
  datasets: ['Datasets & Upload', 'Upload a CSV; every file you upload becomes a dataset the agents can work on'],
  history: ['Run History', 'Every run, replayable from the event log'],
};

interface Health {
  db?: { ok: boolean };
  agents?: { available: boolean; reason?: string };
  telegram?: { configured: boolean; running: boolean; username?: string; chats?: number };
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function AppShell() {
  const { datasets, error: dsError, reload } = useDatasets();
  const [datasetId, setDatasetId] = useState('');
  const [view, setView] = useState<View>('overview');
  const [game, setGame] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [runsKey, setRunsKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [today, setToday] = useState('');
  const [quick, setQuick] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const runs = useRuns(runsKey);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('qp.dataset');
      if (saved) setDatasetId(saved);
    } catch { /* storage blocked */ }
    setToday(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }));
    const check = () => fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    void check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);

  const dataset = datasets?.find((d) => d.id === datasetId) ?? datasets?.[0];
  const theme = THEME;
  const { detail } = useDetail(dataset?.id);

  const speakRef = useRef<(t: string, force?: boolean) => void>(() => {});
  const voiceAskedRef = useRef(false);
  const onFinish = useCallback((m: Mission) => {
    setRunsKey((k) => k + 1);
    const v = m.verdict;
    if (v) speakRef.current(v.status === 'answered' ? v.answer : `I can't answer that. ${v.reason ?? ''}`, voiceAskedRef.current);
    voiceAskedRef.current = false;
  }, []);
  const { mission, start, stop, load, follow, pushRemote } = useMission(onFinish);

  const pickDataset = useCallback((id: string) => {
    setDatasetId(id);
    try { localStorage.setItem('qp.dataset', id); } catch { /* storage blocked */ }
  }, []);
  const go = useCallback((v: View) => {
    setView(v);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleGame = useCallback((on: boolean) => {
    setGame(on);
    uiEvent(on ? 'ui.game.open' : 'ui.game.close', on ? 'Game mode loading…' : 'Back to the dashboard');
  }, []);

  // Runs started from Telegram show up here live: the dashboard follows them like its own.
  const missionRef = useRef(mission);
  useEffect(() => { missionRef.current = mission; }, [mission]);
  const datasetIdsRef = useRef<string[]>([]);
  useEffect(() => { datasetIdsRef.current = datasets?.map((d) => d.id) ?? []; }, [datasets]);
  const onLive = useCallback(async (p: LivePayload) => {
    if (!p.run_id || p.type.startsWith('ui.')) return;
    const m = missionRef.current;
    if (p.type === 'run.started') {
      if (p.source !== 'telegram' || m.status === 'running' || !p.dataset) return;
      if (!datasetIdsRef.current.includes(p.dataset)) await reload();
      pickDataset(p.dataset);
      const mode = p.mode ?? 'ask';
      follow(p.run_id, { dataset: p.dataset, mode, question: p.question }, 'telegram');
      go(mode === 'audit' ? 'audit' : 'ask');
      setToast(`📱 From Telegram: ${mode === 'audit' ? 'data health audit' : `“${p.question ?? ''}”`}`);
    }
    if (!m.remote || m.id !== p.run_id) return;
    pushRemote(p.run_id, {
      run_id: p.run_id, event_id: `${p.run_id}:${p.seq}`, seq: p.seq, timestamp: p.ts,
      type: p.type as QuestEvent['type'], agent_id: p.agent_id as QuestEvent['agent_id'], summary: p.summary,
    });
    if (p.type === 'run.finished' || p.type === 'run.error') {
      const res = await fetch(`/api/runs/${p.run_id}`).then((x) => x.json()).catch(() => null) as { events?: QuestEvent[] } | null;
      if (res?.events && m.request) {
        load(p.run_id, m.request, res.events);
        onFinish({ ...m, status: 'done', events: res.events, verdict: (res.events.find((e) => e.type === 'run.finished')?.metadata?.verdict as Mission['verdict']) ?? null });
      }
    }
  }, [follow, go, load, onFinish, pickDataset, pushRemote, reload]);
  const liveConnected = useLiveFeed(onLive);

  const run = useCallback((req: MissionRequest) => {
    void start(req, 'cinematic');
  }, [start]);
  const ask = useCallback((question: string) => {
    if (!dataset) return;
    go('ask');
    run({ dataset: dataset.id, mode: 'ask', question });
  }, [dataset, go, run]);
  const audit = useCallback((id?: string) => {
    const target = id || dataset?.id;
    if (!target) { go('datasets'); setToast('Upload a CSV first; the agents audit it right away.'); return; }
    pickDataset(target);
    go('audit');
    run({ dataset: target, mode: 'audit' });
  }, [dataset, go, pickDataset, run]);

  const handleVoice = useCallback((text: string) => {
    const cmd = parseVoiceCommand(text, datasets ?? []);
    setToast(`🎙 "${text}"`);
    if (cmd.kind === 'dataset') { pickDataset(cmd.id); speakRef.current(`Switched to ${datasets?.find((d) => d.id === cmd.id)?.name ?? cmd.id}.`, true); }
    else if (cmd.kind === 'audit') { voiceAskedRef.current = true; speakRef.current('Running a data health audit.', true); audit(); }
    else if (cmd.kind === 'game') toggleGame(cmd.on);
    else if (cmd.kind === 'view') go(cmd.view as View);
    else if (cmd.kind === 'stop') { stop(); speakRef.current('Stopped the agents.', true); }
    else if (cmd.kind === 'repeat') {
      const v = missionRef.current.verdict;
      speakRef.current(v ? (v.status === 'answered' ? v.answer : `I couldn't answer that. ${v.reason ?? ''}`) : 'There is no answer yet. Ask me a question first.', true);
    } else if (!dataset) speakRef.current('Upload a CSV first, then ask me about it.', true);
    else { voiceAskedRef.current = true; speakRef.current('Sending the agents.', true); ask(cmd.question); }
  }, [ask, audit, dataset, datasets, go, pickDataset, stop, toggleGame]);
  const voice = useVoice(handleVoice);
  useEffect(() => { speakRef.current = voice.speak; }, [voice.speak]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const listen = voice.listen;
  useEffect(() => {
    if (game) return;
    const h = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'v' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e.target)) return;
      e.preventDefault();
      listen();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [game, listen]);

  const openRun = useCallback(async (r: RunRow) => {
    const res = await fetch(`/api/runs/${r.id}`).then((x) => x.json()).catch(() => null) as { events?: QuestEvent[] } | null;
    if (!res?.events) return;
    const ds = r.island;
    const started = res.events.find((e) => e.type === 'run.started');
    const mode = (started?.metadata?.mode as 'ask' | 'audit' | undefined) ?? 'ask';
    if (datasets?.some((d) => d.id === ds)) pickDataset(ds);
    load(r.id, { dataset: ds, mode, question: r.question }, res.events);
    go(mode === 'audit' ? 'audit' : 'ask');
  }, [datasets, go, load, pickDataset]);

  const onUploaded = useCallback(async (id: string) => {
    await reload();
    invalidateDetail(id);
    setToast('Upload stored. The agents are auditing it now…');
    audit(id);
  }, [audit, reload]);

  const running = mission.status === 'running';
  const [title, subtitle] = TITLES[view];
  const navBadge = (id: View): string | null => {
    if (id === 'datasets' && datasets?.length) return String(datasets.length);
    if (id === 'history' && runs?.length) return runs.length >= 40 ? '40+' : String(runs.length);
    return null;
  };
  const submitQuick = () => {
    const q = quick.trim();
    if (!q || !dataset || running) return;
    ask(q);
    setQuick('');
  };

  return (
    <div
      className="qp-app qp-grain h-screen w-screen select-text overflow-hidden p-2 text-[#1d1d1f] sm:p-3 lg:p-5"
      style={{ background: 'radial-gradient(1100px 600px at 0% 0%, #f1f9c9 0%, transparent 60%), radial-gradient(900px 600px at 100% 100%, #cfe170 0%, transparent 55%), radial-gradient(700px 500px at 60% 40%, rgba(185,170,246,0.18), transparent 60%), #dce98f' }}
      onPointerMove={(e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('.qp-card');
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
    >
      <div className="flex h-full w-full overflow-hidden rounded-[28px] bg-[#161618] shadow-[0_60px_120px_-40px_rgba(29,29,31,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset] lg:rounded-[36px]">
        {/* Sidebar */}
        <aside className="qp-sidebar flex w-[76px] shrink-0 flex-col overflow-y-auto px-3 py-5 [scrollbar-width:none] xl:w-[250px] xl:px-4">
          <button onClick={() => go('overview')} className="qp-logo-host group flex items-center gap-3 px-1.5 xl:px-2" aria-label="QueryPilot home">
            <LogoMark size={42} className="drop-shadow-[0_8px_18px_rgba(214,242,106,0.25)] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.3,1.3)] group-hover:scale-105" />
            <span className="hidden text-left xl:block">
              <Wordmark className="block" />
              <span className="mt-1.5 block text-[11px] text-white/45">Agentic data analyst</span>
            </span>
          </button>

          <nav className="mt-8 flex-1 space-y-1.5">
            {NAV.map((n) => {
              const active = view === n.id;
              const badge = navBadge(n.id);
              const live = running && ((n.id === 'ask' && mission.request?.mode === 'ask') || (n.id === 'audit' && mission.request?.mode === 'audit'));
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  title={`${n.label}: ${n.hint}`}
                  className={cn(
                    'group relative flex w-full items-center gap-3 rounded-full px-3.5 py-3 text-left transition-all duration-300 ease-out',
                    active ? 'bg-white text-[#1d1d1f] shadow-[0_8px_20px_-10px_rgba(255,255,255,0.45)]' : 'text-white/60 hover:bg-white/[0.07] hover:text-white xl:hover:pl-5',
                  )}
                >
                  <n.icon className={cn('h-[19px] w-[19px] shrink-0 transition-transform duration-300 group-hover:scale-110', active ? 'text-[#1d1d1f]' : 'group-hover:-rotate-6')} />
                  <span className="hidden text-[13.5px] font-medium xl:inline">{n.label}</span>
                  {live && <span className="absolute right-2 top-2 h-2.5 w-2.5 animate-pulse rounded-full bg-[#d6f26a] xl:static xl:ml-auto" />}
                  {!live && badge && (
                    <span className="ml-auto hidden h-5 min-w-5 place-items-center rounded-full bg-[#d6f26a] px-1.5 text-[10.5px] font-bold text-[#1d1d1f] transition-transform duration-300 group-hover:scale-110 xl:grid">{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 space-y-2.5">
            {/* Game mode card */}
            <div className="group relative hidden overflow-hidden rounded-[24px] bg-[#d6f26a] p-4 text-[#1d1d1f] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_40px_-18px_rgba(214,242,106,0.6)] xl:block">
              <div className="text-[17px] font-semibold leading-tight tracking-tight">Game mode</div>
              <div className="mt-1 text-[11.5px] leading-snug text-black/60">The same agents as a crew exploring the islands of Schema City.</div>
              <div className="relative my-3 h-[78px]">
                <span className="qp-float absolute left-1 top-1 h-4 w-4 rounded-full bg-[#7c6cf0]" />
                <span className="qp-float absolute right-3 top-0 h-3 w-3 rounded-full bg-[#b9aaf6]" style={{ animationDelay: '0.6s' }} />
                <span className="qp-float absolute bottom-1 right-8 h-5 w-5 rounded-full bg-[#1d1d1f]/80" style={{ animationDelay: '1.2s' }} />
                <span className="qp-float absolute bottom-3 left-8 h-2.5 w-2.5 rounded-full bg-[#7c6cf0]" style={{ animationDelay: '1.8s' }} />
                <div className="absolute left-1/2 top-1/2 grid h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[20px] bg-[#1d1d1f] text-[#d6f26a] shadow-xl transition-transform duration-500 ease-[cubic-bezier(.2,.9,.3,1.3)] group-hover:-rotate-12 group-hover:scale-110">
                  <Gamepad2 className="h-8 w-8" />
                </div>
              </div>
              <button onClick={() => toggleGame(true)} className="qp-shine flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#1d1d1f] text-[13px] font-semibold text-white transition-all duration-200 hover:gap-2.5 active:scale-95">
                {game ? 'Game is open' : 'Play now'} <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
            <button onClick={() => toggleGame(true)} title="Game mode" className="grid h-12 w-full place-items-center rounded-full bg-[#d6f26a] text-[#1d1d1f] transition-transform duration-300 hover:scale-105 hover:-rotate-6 xl:hidden">
              <Gamepad2 className="h-5 w-5" />
            </button>

            {health?.telegram?.username && (
              <a
                href={`https://t.me/${health.telegram.username}`} target="_blank" rel="noreferrer"
                title="Telegram bot: runs from anywhere appear here, and dashboard runs appear there"
                className="group flex items-center gap-2.5 rounded-2xl bg-white/[0.05] px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.1]"
              >
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#b9aaf6] text-[#1d1d1f]">
                  <Send className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-12 group-hover:translate-x-0.5" />
                  <span className={cn('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#1d1d1f]', health?.telegram?.running ? 'bg-[#d6f26a]' : 'bg-white/30')} />
                </span>
                <span className="hidden min-w-0 text-[11.5px] leading-snug xl:block">
                  <span className="block truncate font-semibold text-white">@{health.telegram.username}</span>
                  <span className="block text-white/45">
                    {health.telegram.running ? `Live${liveConnected ? ' · synced' : ''} · ${health.telegram.chats ?? 0} chat${health.telegram.chats === 1 ? '' : 's'}` : 'Starting…'}
                  </span>
                </span>
              </a>
            )}
            {health && !health.agents?.available && (
              <div className="hidden items-start gap-2.5 rounded-2xl bg-rose-500/10 px-3 py-3 ring-1 ring-rose-400/20 xl:flex">
                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <div className="min-w-0 text-[11.5px] leading-snug">
                  <div className="truncate font-semibold text-white">Agents unavailable</div>
                  <div className="text-white/45">{health.agents?.reason ?? 'Try again in a minute.'}</div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main canvas */}
        <div className="my-2 mr-2 qp-canvas flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] lg:rounded-[30px]">
          <main ref={scrollRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)} className="relative min-h-0 flex-1 overflow-y-auto">
          <header className={cn(
            'sticky top-0 z-30 flex items-center gap-3 px-5 py-4 transition-[background-color,box-shadow,backdrop-filter] duration-300 lg:px-7',
            scrolled && 'bg-[#ebebea]/75 shadow-[0_1px_0_rgba(29,29,31,0.06),0_12px_30px_-20px_rgba(29,29,31,0.35)] backdrop-blur-xl backdrop-saturate-150',
          )}>
            {dataset ? (
              <DatasetPicker datasets={datasets ?? []} active={dataset} onPick={pickDataset} />
            ) : (
              <button onClick={() => go('datasets')} className="flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#d6f26a]"><UploadCloud className="h-4 w-4" /></span> Upload a CSV
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <label className={cn(
                'group hidden h-12 w-[min(360px,32vw)] items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_1px_2px_rgba(29,29,31,0.05),inset_0_1px_0_#fff] ring-1 ring-black/[0.04] transition-all duration-300 focus-within:w-[min(460px,40vw)] focus-within:shadow-[0_0_0_4px_rgba(185,170,246,0.45)] hover:shadow-md md:flex',
                !dataset && 'opacity-60',
              )}>
                <Search className="h-[18px] w-[18px] shrink-0 text-black/45 transition-colors group-focus-within:text-[#7c6cf0]" />
                <input
                  value={voice.listening ? voice.interim || quick : quick}
                  onChange={(e) => setQuick(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitQuick()}
                  disabled={!dataset}
                  placeholder={voice.listening ? 'Listening…' : dataset ? 'Ask the agents anything…' : 'Upload a CSV to ask questions'}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-black/40"
                  aria-label="Ask the agents"
                />
                {quick.trim() && !running && (
                  <button onClick={submitQuick} className="rounded-full bg-[#1d1d1f] px-3 py-1 text-[11.5px] font-semibold text-white transition-transform active:scale-95 animate-in fade-in zoom-in-90 duration-150">Ask</button>
                )}
              </label>
              <RoundButton onClick={voice.listen} active={voice.listening} title="Voice command: e.g. “run audit”, “show old vs new”, or any question (shortcut: V)">
                {voice.listening ? <span className="qp-wave flex h-4 items-center gap-[2px]"><span className="h-4" /><span className="h-4" /><span className="h-4" /></span> : <Mic className="h-[18px] w-[18px]" />}
              </RoundButton>
              {voice.supported.output && (
                <RoundButton onClick={voice.toggleSpeak} active={voice.speakOn} title={voice.speakOn ? 'Spoken answers on' : 'Spoken answers off'}>
                  {voice.speakOn ? <Volume2 className={cn('h-[18px] w-[18px]', voice.speaking && 'animate-pulse')} /> : <VolumeX className="h-[18px] w-[18px]" />}
                </RoundButton>
              )}
            </div>
          </header>

            <div className="mx-auto max-w-[1440px] px-5 pb-28 pt-3 lg:px-7">
              <div className="mb-6 flex flex-wrap items-end gap-4">
                <div key={view} className="min-w-0 animate-in fade-in slide-in-from-left-2 duration-500">
                  <h1 className="qp-title-glow pb-1 text-[34px] font-medium leading-[1.05] tracking-[-0.035em] lg:text-[46px]">{title}</h1>
                  <p className="mt-2 text-[13px] text-black/50">{subtitle}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  {today && <span className="hidden text-[12.5px] text-black/45 sm:inline">{today}</span>}
                  {dataset && view !== 'overview' && view !== 'datasets' && view !== 'history' && (
                    <span className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                      <span className={cn('h-2.5 w-2.5 rounded-full', dataset.score >= 85 ? 'bg-[#9cc92a]' : dataset.score >= 60 ? 'bg-amber-500' : 'bg-rose-500')} />
                      Clarity {dataset.score}/100
                    </span>
                  )}
                </div>
              </div>

              {dsError && <div className="mb-4 rounded-[20px] bg-rose-50 px-4 py-3 text-[13px] text-rose-700 ring-1 ring-rose-200">{dsError}</div>}
              {mission.remote && (view === 'ask' || view === 'audit') && (
                <div className="mb-4 flex items-center gap-2.5 rounded-[20px] bg-[#ece8fd] px-4 py-3 text-[13px] text-[#3b2fa0] animate-in fade-in slide-in-from-top-1 duration-300">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#b9aaf6] text-[#1d1d1f]"><Send className="h-3.5 w-3.5" /></span>
                  <span><span className="font-semibold">Started from Telegram.</span> The dashboard is following this run live; the full trace loads when it finishes.</span>
                  {mission.status === 'running' && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
                </div>
              )}
              {dataset && view !== 'overview' && view !== 'datasets' && view !== 'history' && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-black/55">
                  <Badge tone="violet"><theme.icon className="h-3 w-3" /> {dataset.name}</Badge>
                  <span>{dataset.tables.length} table{dataset.tables.length === 1 ? '' : 's'} · {dataset.rows.toLocaleString()} rows</span>
                </div>
              )}
              {!datasets && !dsError && (
                <div className="grid h-[50vh] place-items-center text-black/50">
                  <div className="flex items-center gap-2 text-[13px]"><Loader2 className="h-4 w-4 animate-spin" /> Loading datasets…</div>
                </div>
              )}
              {datasets && !dataset && (view === 'ask' || view === 'audit' || view === 'compare' || view === 'explorer') && (
                <div className="grid h-[46vh] place-items-center rounded-[26px] bg-white">
                  <div className="max-w-md text-center">
                    <div className="qp-float mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#d6f26a]"><Database className="h-6 w-6" /></div>
                    <div className="mt-4 text-[17px] font-semibold">No dataset yet</div>
                    <p className="mt-1 text-[13px] text-black/50">Upload a CSV to get started. The agents only work on data you upload.</p>
                    <div className="mt-5 flex justify-center gap-2">
                      <Button variant="primary" onClick={() => go('datasets')}><UploadCloud className="h-4 w-4" /> Upload a CSV</Button>
                    </div>
                  </div>
                </div>
              )}
              {datasets && (
                <div key={view} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                  {view === 'overview' && (
                    <OverviewView
                      datasets={datasets} activeId={dataset?.id ?? ''} runs={runs}
                      onOpen={(id) => { pickDataset(id); go('ask'); }}
                      onAsk={() => go('ask')} onAudit={(id) => audit(id)} onUpload={() => go('datasets')} onOpenRun={openRun} onNavigate={go}
                    />
                  )}
                  {view === 'ask' && dataset && (
                    <AskView
                      dataset={dataset} theme={theme} mission={mission} onAsk={ask} onStop={stop}
                      voice={{ supported: voice.supported.input, listening: voice.listening, interim: voice.interim, listen: voice.listen }}
                      onSpeak={(t) => voice.speak(t, true)}
                    />
                  )}
                  {view === 'audit' && dataset && <AuditView dataset={dataset} detail={detail} theme={theme} mission={mission} onAudit={() => audit()} onCompare={() => go('compare')} />}
                  {view === 'compare' && dataset && <CompareView dataset={dataset} detail={detail} theme={theme} />}
                  {view === 'explorer' && dataset && <ExplorerView dataset={dataset} detail={detail} theme={theme} />}
                  {view === 'datasets' && (
                    <DatasetsView
                      datasets={datasets} activeId={dataset?.id ?? ''} onOpen={(id) => { pickDataset(id); go('ask'); }} onAudit={(id) => audit(id)} onUploaded={onUploaded}
                      onExplore={(id) => { pickDataset(id); go('explorer'); }}
                      onKnowledgeSaved={(id) => { invalidateDetail(id); void reload(); }}
                    />
                  )}
                  {view === 'history' && <HistoryView runs={runs} datasets={datasets} onOpenRun={openRun} />}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {!game && <VoiceDock voice={voice} running={running} suggestion={dataset?.questions[0]?.question} />}

      {(toast || voice.error) && (
        <div className="pointer-events-none fixed bottom-7 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-300">
          <div className={cn('pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-medium shadow-[0_20px_40px_-16px_rgba(29,29,31,0.6)]', voice.error ? 'bg-rose-600 text-white' : 'bg-[#1d1d1f] text-white')}>
            {voice.error ?? toast}
            {voice.error && <button onClick={voice.clearError} className="ml-1 opacity-80 hover:opacity-100"><X className="h-4 w-4" /></button>}
          </div>
        </div>
      )}

      {game && (
        <div className="fixed inset-0 z-50 animate-in fade-in zoom-in-[0.98] duration-300">
          <QuestGame onExit={() => toggleGame(false)} />
          <div className="absolute bottom-3 left-1/2 z-[60] -translate-x-1/2">
            <Button onClick={() => toggleGame(false)} className="!h-10 border-slate-700 !bg-slate-900/90 !text-white shadow-xl backdrop-blur hover:!bg-slate-800">
              <LayoutDashboard className="h-4 w-4" /> Back to dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundButton({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'relative grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1.3)] hover:-translate-y-0.5 hover:scale-105 active:scale-90',
        active ? 'qp-ink-btn text-[#d6f26a] shadow-[0_10px_24px_-10px_rgba(29,29,31,0.6)]' : 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(29,29,31,0.05),inset_0_1px_0_#fff] ring-1 ring-black/[0.04] hover:shadow-[0_12px_24px_-12px_rgba(29,29,31,0.3)]',
      )}
    >
      {children}
    </button>
  );
}

function DatasetPicker({ datasets, active, onPick }: { datasets: { id: string; name: string; rows: number; tables: unknown[] }[]; active: { id: string; name: string; rows: number; tables: unknown[] }; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0">
      <button onClick={() => setOpen((o) => !o)} className="group flex min-w-0 items-center gap-3 rounded-full py-1 pr-3 transition-all duration-200 hover:bg-white/70" title="Switch dataset">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#b9aaf6] to-[#7c6cf0] text-white ring-4 ring-white transition-transform duration-300 group-hover:scale-105 group-hover:rotate-6">
          <THEME.icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block max-w-[220px] truncate text-[14px] font-semibold leading-tight">{active.name}</span>
          <span className="block text-[12px] text-black/45">{active.tables.length} table{active.tables.length === 1 ? '' : 's'} · {active.rows.toLocaleString()} rows</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-black/50 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-[22px] bg-white p-1.5 shadow-[0_24px_50px_-20px_rgba(29,29,31,0.4)] animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-200">
            {datasets.map((d) => (
              <button key={d.id} onClick={() => { onPick(d.id); setOpen(false); }} className={cn('flex w-full items-center gap-2.5 rounded-full px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[#f3f3f3]', d.id === active.id && 'bg-[#d6f26a] hover:bg-[#d6f26a]')}>
                <THEME.icon className="h-4 w-4 shrink-0" /> <span className="flex-1 truncate font-medium">{d.name}</span>
                <span className="text-[11px] text-black/45">{d.rows.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
