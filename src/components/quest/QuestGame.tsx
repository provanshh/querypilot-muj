'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameProvider, useGame } from '@/context/GameContext';
import { CanvasIsometricGrid } from '@/components/game/CanvasIsometricGrid';
import type { AgentId, ApprovalMode, IslandId, QuestEvent } from '@/lib/quest/types';
import type { Building } from '@/types/game';
import { withFog, islandAt, nearestTable, SEA_MID, type GridPoint, type Plot } from '@/lib/quest/island';
import { CREW } from '@/lib/quest/crew';
import { sfx } from '@/lib/quest/sound';
import { narrate, SPOKEN, voice } from '@/lib/quest/narrator';
import { useLane, useProfile, useWorld, type Toast, type WorldState } from './useQuest';
import { useLive } from './useLive';
import { CrewLayer, type Viewport } from './CrewLayer';
import { SkyLayer, type Flight } from './SkyLayer';
import { CityScanPanel, ConsolePanel, CrewBar, OrderPanel, Toasts } from './hud/Panels';
import { TableDossier } from './hud/Dossier';
import { VerdictScreen } from './hud/VerdictScreen';
import { HelpOverlay, TitleScreen } from './hud/Screens';
import { HowButton, HowPanel, type NarratorLine } from './hud/HowPanel';
import { RowCard } from './hud/RowCard';
import { HistoryPanel } from './hud/HistoryPanel';
import { islandMeta, nextIsland } from '@/lib/quest/islands';
import { uiEvent } from '@/lib/uiEvent';

const RISE_MS = 1100;
const ISLAND_ZOOM = 0.85;

type LeftPanel =
  | { kind: 'dossier'; island: IslandId; table: string }
  | { kind: 'rows'; island: IslandId; table: string; offset: number; building: string }
  | { kind: 'history' }
  | null;

function hash(x: number, y: number) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}

function QuestGameInner({ onExit }: { onExit?: () => void }) {
  const { world, reload } = useWorld();
  if (!world.ready || !world.order.length) {
    return (
      <div className="relative w-screen h-screen overflow-hidden bg-[#1a68a6] select-none text-slate-100">
        <TitleScreen ready={world.ready} error={world.error} agents={world.agents} onStart={() => {}} onRetry={reload} onExit={onExit} />
      </div>
    );
  }
  return <Archipelago world={world} reload={reload} onExit={onExit} />;
}

type Lane = ReturnType<typeof useLane>;

/** The map: one island per uploaded dataset (up to three, a hook slot each so hook order never changes). */
function Archipelago({ world, reload, onExit }: { world: WorldState; reload: () => void; onExit?: () => void }) {
  const { loadWorld, patchTiles } = useGame();
  const { profile, award, lastXp } = useProfile();
  const ids = world.order;
  const lane0 = useLane(ids[0], world, award);
  const lane1 = useLane(ids[1] ?? '__slot1', world, award);
  const lane2 = useLane(ids[2] ?? '__slot2', world, award);
  const lanes = useMemo(
    () => Object.fromEntries([lane0, lane1, lane2].slice(0, ids.length).map((l) => [l.id, l])) as Record<IslandId, Lane>,
    [lane0, lane1, lane2, ids.length],
  );
  const live = useLive();
  const layout = world.layout;

  const [focus, setFocus] = useState<IslandId>(ids[0]);
  const lane = lanes[focus];
  const state = lane.state;
  const schema = world.islands?.[focus]?.schema;
  const anyRunning = Object.values(lanes).some((l) => l.state.running);

  const [started, setStarted] = useState(false);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('ask');
  const [pace, setPace] = useState<'cinematic' | 'fast'>('cinematic');
  const [showLabels, setShowLabels] = useState(true);
  const [muted, setMuted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [voiceOn, setVoiceOnState] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [left, setLeft] = useState<LeftPanel>(null);
  const [navTarget, setNavTarget] = useState<(GridPoint & { zoom?: number }) | null>(null);
  const [follow, setFollow] = useState<AgentId | null>(null);
  const [wipe, setWipe] = useState(0);
  const [hint, setHint] = useState<Toast | null>(null);
  const [lines, setLines] = useState<NarratorLine[]>([]);

  const viewportRef = useRef<Viewport | null>(null);
  const pos0 = useRef<Partial<Record<AgentId, GridPoint>>>({});
  const pos1 = useRef<Partial<Record<AgentId, GridPoint>>>({});
  const pos2 = useRef<Partial<Record<AgentId, GridPoint>>>({});
  const positionsRef = useMemo(() => Object.fromEntries(ids.map((id, i) => [id, [pos0, pos1, pos2][i]])), [ids]);
  const inputRef = useRef<HTMLInputElement>(null);
  const flightsRef = useRef<Flight[]>([]);
  const renderedFogRef = useRef<Record<IslandId, Set<string>> | null>(null);
  const risingRef = useRef<Map<string, { start: number; step: number; plot: Plot }>>(new Map());
  const riseRafRef = useRef(0);

  const lastIslandRef = useRef<IslandId | null>(null);
  useEffect(() => {
    if (!started) return;
    if (lastIslandRef.current && lastIslandRef.current !== focus) uiEvent('ui.game.island', `Flying to ${islandMeta(focus).name}`, focus);
    lastIslandRef.current = focus;
  }, [focus, started]);
  const readySentRef = useRef(false);
  useEffect(() => {
    if (!world.ready || readySentRef.current) return;
    readySentRef.current = true;
    uiEvent('ui.game.ready', `Islands loaded: ${ids.map((id) => islandMeta(id).name).join(', ')}`);
  }, [world.ready, ids]);

  const selectedTable = left?.kind === 'dossier' && left.island === focus ? left.table : null;
  const setVoiceOn = useCallback((v: boolean) => { voice.setEnabled(v); setVoiceOnState(v); }, []);
  const showHint = useCallback((text: string, sub?: string) => setHint({ id: Date.now(), text, sub, tone: 'info', at: Date.now() }), []);

  /* ------------------------------- camera -------------------------------- */

  const centerOf = (p: Plot): GridPoint => ({ x: p.x + (p.w - 1) / 2, y: p.y + (p.h - 1) / 2 });
  const goHome = useCallback(() => { if (layout) setNavTarget({ ...centerOf(layout.islands[focus].hq), zoom: ISLAND_ZOOM }); }, [layout, focus]);
  const flyTo = useCallback((id: IslandId, opts: { wipe?: boolean } = {}) => {
    if (!layout) return;
    setFocus(id);
    setFollow(null);
    setNavTarget({ ...centerOf(layout.islands[id].hq), zoom: ISLAND_ZOOM });
    if (opts.wipe !== false) { setWipe((w) => w + 1); sfx.whoosh(); }
  }, [layout]);
  const overview = useCallback(() => {
    setFollow(null);
    const z = Math.max(0.26, Math.min(0.5, window.innerWidth / 4600));
    setNavTarget({ ...SEA_MID, zoom: z });
    sfx.whoosh();
  }, []);

  /* ----------------------------- world + fog ----------------------------- */

  useEffect(() => {
    if (!layout || !world.islands) return;
    const want: Record<IslandId, Set<string>> = Object.fromEntries(ids.map((id) => [id, new Set(lanes[id].state.discovered)]));
    const rendered = renderedFogRef.current;
    const removed = !rendered || ids.some((id) => [...(rendered[id] ?? [])].some((t) => !want[id].has(t)));
    if (removed) {
      loadWorld(withFog(layout, want), 'Schema Archipelago');
      renderedFogRef.current = want;
      return;
    }
    const added: { key: string; plot: Plot }[] = [];
    for (const id of ids) {
      for (const t of want[id]) if (!rendered[id]?.has(t) && layout.islands[id].plots[t]) added.push({ key: `${id}:${t}`, plot: layout.islands[id].plots[t] });
    }
    if (!added.length) return;
    renderedFogRef.current = want;
    const now = performance.now();
    for (const a of added) risingRef.current.set(a.key, { start: now, step: -1, plot: a.plot });
    if (riseRafRef.current) return;
    const tick = () => {
      const patches: { x: number; y: number; building: Partial<Building> }[] = [];
      const t1 = performance.now();
      for (const [key, r] of risingRef.current) {
        const p = r.plot;
        const k = Math.min(1, (t1 - r.start) / RISE_MS);
        const step = Math.round(k * 12);
        if (step === r.step) continue;
        r.step = step;
        for (let dy = 0; dy < p.h; dy++) {
          for (let dx = 0; dx < p.w; dx++) {
            const src = layout.grid[p.y + dy][p.x + dx].building;
            patches.push({ x: p.x + dx, y: p.y + dy, building: { ...src, constructionProgress: dx === 0 && dy === 0 ? Math.round((step / 12) * 100) : 100 } });
          }
        }
        if (k >= 1) risingRef.current.delete(key);
      }
      patchTiles(patches);
      riseRafRef.current = risingRef.current.size ? requestAnimationFrame(tick) : 0;
    };
    riseRafRef.current = requestAnimationFrame(tick);
    // Keyed on each lane's discovered list, not on the lane objects (which change every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, world.islands, lane0.state.discovered, lane1.state.discovered, lane2.state.discovered, loadWorld, patchTiles]);

  useEffect(() => () => { if (riseRafRef.current) cancelAnimationFrame(riseRafRef.current); }, []);

  /* --------------------------- clicks on the map ------------------------- */

  useEffect(() => {
    if (!selectedTile || !layout) return;
    const { x, y } = selectedTile;
    const id = islandAt(layout, x, y);
    if (!id) { setLeft(null); return; }
    if (id !== focus) setFocus(id);
    const isl = layout.islands[id];
    const within = (p: Plot) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
    sfx.click();
    if (within(isl.hq)) { setLeft({ kind: 'history' }); sfx.open(); return; }
    const plot = Object.values(isl.plots).find(within);
    if (plot) {
      if (lanes[id].state.discovered.includes(plot.table)) { setLeft({ kind: 'dossier', island: id, table: plot.table }); sfx.open(); }
      else { setLeft(null); showHint('UNCHARTED DISTRICT', 'Fog hides this building. Send the crew on any mission and the Scout will map it.'); }
      return;
    }
    const tileType = layout.grid[y]?.[x]?.building.type;
    const isScenery = isl.scenery.some((p) => p.x === x && p.y === y);
    if (isScenery && tileType) {
      const table = nearestTable(isl, x, y);
      const t = world.islands?.[id]?.schema.tables.find((tb) => tb.name === table);
      if (table && t) {
        setLeft({ kind: 'rows', island: id, table, offset: hash(x, y) % Math.max(1, t.rowCount - 2), building: tileType });
        sfx.open();
        return;
      }
    }
    setLeft(null);
    // Intentionally keyed on the clicked tile only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTile]);

  const focusTable = useCallback((t: string) => {
    const p = layout?.islands[focus].plots[t];
    if (!p) return;
    setLeft({ kind: 'dossier', island: focus, table: t });
    setNavTarget(centerOf(p));
  }, [layout, focus]);

  /* ------------------------------- follow -------------------------------- */

  useEffect(() => {
    if (!follow) return;
    const ref = positionsRef[focus];
    const tick = () => {
      const pos = ref.current[follow];
      if (pos) setNavTarget({ x: pos.x, y: pos.y });
    };
    tick();
    const id = setInterval(tick, 700);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, focus]);

  /* --------------------- event side effects (both lanes) ------------------ */

  const seenRef = useRef<Record<IslandId, string | null>>({});
  const lastPlaneRef = useRef(0);
  const onLaneEvents = useCallback((id: IslandId, fresh: QuestEvent[]) => {
    const audible = id === focus;
    const newLines: NarratorLine[] = [];
    for (const e of fresh) {
      if (audible) {
        switch (e.type) {
          case 'schema.table_discovered': sfx.discover(); break;
          case 'data.issue_found': sfx.alert(); break;
          case 'approval.requested': sfx.alert(); break;
          case 'approval.resolved': sfx.stamp(); break;
          case 'validation.check_passed': sfx.pass(); break;
          case 'validation.check_failed': case 'query.execution_failed': sfx.fail(); break;
          case 'repair.requested': sfx.repair(); break;
          case 'answer.approved': sfx.victory(); break;
          case 'answer.abstained': sfx.abstain(); break;
        }
      }
      const label = flightLabel(e);
      if (label) {
        flightsRef.current.push({ id: Date.now() + Math.random(), from: id, label, color: islandMeta(id).color, start: Date.now(), dur: 4200 });
        if (audible && Date.now() - lastPlaneRef.current > 2500) { lastPlaneRef.current = Date.now(); sfx.plane(); }
      }
      const text = narrate(e, islandMeta(id).name);
      if (text) {
        newLines.push({ id: e.event_id, text, island: id, at: Date.now() });
        if (audible && SPOKEN.has(e.type)) voice.say(text);
      }
    }
    if (newLines.length) setLines((l) => [...l, ...newLines].slice(-40));
  }, [focus]);

  useEffect(() => {
    for (const id of ids) {
      const feed = lanes[id].state.feed;
      if (!feed.length) { seenRef.current[id] = null; continue; }
      const last = seenRef.current[id];
      const idx = last ? feed.findIndex((e) => e.event_id === last) : -1;
      const fresh = feed.slice(idx + 1);
      seenRef.current[id] = feed[feed.length - 1].event_id;
      if (fresh.length) onLaneEvents(id, fresh.slice(-6));
    }
    // Keyed on each lane's feed, not on the lane objects (which change every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane0.state.feed, lane1.state.feed, lane2.state.feed, ids, onLaneEvents]);

  /* ------------------------------- verdict ------------------------------- */

  useEffect(() => {
    if (!state.verdict) { setVerdictOpen(false); return; }
    const id = setTimeout(() => setVerdictOpen(true), 1400);
    return () => clearTimeout(id);
  }, [state.verdict]);

  /* ------------------------------- actions ------------------------------- */

  const startOn = useCallback((id: IslandId, question: string) => {
    (document.activeElement as HTMLElement | null)?.blur();
    sfx.dispatch();
    setVerdictOpen(false);
    setLeft(null);
    void lanes[id].start({ question, approval: approvalMode, pace });
    uiEvent('ui.game.dispatch', `Order dispatched on ${islandMeta(id).name}: "${question}"`, id);
  }, [lanes, approvalMode, pace]);

  const dispatchOrder = useCallback((question: string) => {
    if (state.running) return;
    goHome();
    startOn(focus, question);
  }, [state.running, startOn, goHome, focus]);

  const approve = useCallback((d: 'approve' | 'deny') => {
    if (!state.approval) return;
    void lane.approve(d);
  }, [state.approval, lane]);

  const replay = useCallback(() => {
    if (state.running || !lane.canReplay) return;
    setVerdictOpen(false);
    goHome();
    void lane.replay();
  }, [state.running, lane, goHome]);

  const replayRun = useCallback((runId: string, id: IslandId) => {
    if (lanes[id].state.running) return;
    setLeft(null);
    if (id !== focus) flyTo(id); else goHome();
    void lanes[id].replayRun(runId);
  }, [lanes, focus, flyTo, goHome]);

  const setTarget = useCallback((t: IslandId) => {
    sfx.click();
    if (t !== focus) flyTo(t); else goHome();
  }, [focus, flyTo, goHome]);

  const begin = useCallback(() => {
    if (started) return;
    sfx.unlock();
    sfx.dispatch();
    setStarted(true);
    flyTo(ids[0], { wipe: false });
    uiEvent('ui.game.start', `Game started: the crew is at City Hall on ${islandMeta(ids[0]).name}`, ids[0]);
  }, [started, flyTo, ids]);

  /* ------------------------------- hotkeys ------------------------------- */

  const keyState = useRef({ state, started, helpOpen, verdictOpen, left, follow, muted, howOpen, focus });
  keyState.current = { state, started, helpOpen, verdictOpen, left, follow, muted, howOpen, focus };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      if (!k.started) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 'escape') {
        if (k.helpOpen) setHelpOpen(false);
        else if (k.verdictOpen) setVerdictOpen(false);
        else if (k.howOpen) setHowOpen(false);
        else if (k.left) { setLeft(null); setSelectedTile(null); }
        else if (k.follow) setFollow(null);
        return;
      }
      if (key === '?') { setHelpOpen((v) => !v); return; }
      if (key === 'h') { setHowOpen((v) => !v); sfx.open(); return; }
      if (k.state.approval && (key === 'y' || key === 'n')) {
        approve(key === 'y' ? 'approve' : 'deny');
        return;
      }
      switch (key) {
        case 'enter':
          e.preventDefault();
          setVerdictOpen(false);
          inputRef.current?.focus();
          break;
        case 'i':
          flyTo(nextIsland(k.focus));
          break;
        case 'o':
          overview();
          break;
        case 'x':
          if (k.state.running) void lanes[k.focus].halt();
          break;
        case 'r':
          replay();
          break;
        case 'v':
          if (k.state.verdict) setVerdictOpen((v) => !v);
          break;
        case 'c':
          setFollow(null);
          goHome();
          break;
        case 'l':
          setShowLabels((v) => !v);
          break;
        case 'm': {
          const next = !k.muted;
          sfx.setMuted(next);
          setMuted(next);
          break;
        }
        case 'tab': {
          e.preventDefault();
          const list = k.state.discovered;
          if (!list.length) break;
          const cur = k.left?.kind === 'dossier' ? k.left.table : null;
          const i = cur ? list.indexOf(cur) : -1;
          const next = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
          setFollow(null);
          focusTable(next);
          break;
        }
        default:
          if (/^[1-6]$/.test(key)) {
            const id = CREW[Number(key) - 1].id;
            setFollow((f) => (f === id ? null : id));
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [approve, replay, goHome, focusTable, flyTo, overview, lanes]);

  const alerts = useMemo(() => Object.values(state.marks).reduce((a, m) => a + m.issues.length, 0), [state.marks]);
  const onViewportChange = useCallback((vp: Viewport) => { viewportRef.current = vp; }, []);
  const clearNav = useCallback(() => setNavTarget(null), []);
  const toasts = state.toasts;
  const dismissToast = useCallback((id: number) => lane.dismissToast(id), [lane]);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3400);
    return () => clearTimeout(t);
  }, [hint]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1a68a6] select-none text-slate-100">
      <div className="absolute inset-0">
        <CanvasIsometricGrid
          overlayMode="none"
          selectedTile={selectedTile}
          setSelectedTile={setSelectedTile}
          navigationTarget={navTarget}
          onNavigationComplete={clearNav}
          onViewportChange={onViewportChange}
          theme="island"
          fixedHour={12}
        />
      </div>

      {layout && world.islands && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {ids.map((id) => (
            <CrewLayer
              key={id}
              layout={layout.islands[id]}
              schema={world.islands![id].schema}
              discovered={lanes[id].state.discovered}
              agents={lanes[id].state.agents}
              activeAgent={lanes[id].state.activeAgent}
              marks={lanes[id].state.marks}
              links={lanes[id].state.links}
              viewportRef={viewportRef}
              positionsRef={positionsRef[id]}
              showLabels={showLabels}
              selectedTable={id === focus ? selectedTable : null}
            />
          ))}
          <SkyLayer layout={layout} viewportRef={viewportRef} flightsRef={flightsRef} />
        </div>
      )}

      {wipe > 0 && <CloudWipe key={wipe} />}

      {started && schema && world.islands && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto">
            <IslandBar ids={ids} focus={focus} onPick={setTarget} onOverview={overview} running={Object.fromEntries(ids.map((id) => [id, lanes[id].state.running]))} />
          </div>

          <div className="absolute top-3 left-3">
            {!left && (
              <CityScanPanel
                schema={{ ...schema, name: islandMeta(focus).name }}
                discovered={state.discovered}
                alerts={alerts}
                agents={world.agents}
                profile={profile}
                onResetFog={() => { if (!state.running) { lane.resetFog(); setLeft(null); } }}
              />
            )}
            {left?.kind === 'dossier' && world.islands[left.island] && (
              <TableDossier schema={world.islands[left.island].schema} table={left.table} mark={lanes[left.island].state.marks[left.table]} onClose={() => { setLeft(null); setSelectedTile(null); }} />
            )}
            {left?.kind === 'rows' && (
              <RowCard
                key={`${left.island}:${left.table}:${left.offset}`}
                island={left.island} table={left.table} offset={left.offset} kind={left.building}
                onClose={() => { setLeft(null); setSelectedTile(null); }}
                onOpenTable={() => lanes[left.island].state.discovered.includes(left.table)
                  ? setLeft({ kind: 'dossier', island: left.island, table: left.table })
                  : showHint('UNCHARTED DISTRICT', 'The Scout has not mapped this table yet. Run any mission first.')}
              />
            )}
            {left?.kind === 'history' && (
              <HistoryPanel island={focus} live={live} busy={anyRunning} onReplay={replayRun} onClose={() => setLeft(null)} />
            )}
          </div>

          <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
            <LiveDot live={live} />
            <HowButton open={howOpen} onClick={() => { setHowOpen((v) => !v); sfx.open(); }} />
          </div>

          {howOpen && (
            <div className="absolute top-[52px] right-[356px]">
              <HowPanel lines={lines} onClose={() => setHowOpen(false)} voiceOn={voiceOn} setVoiceOn={setVoiceOn} />
            </div>
          )}

          <div className="absolute top-[52px] right-3">
            <ConsolePanel
              schemaName={islandMeta(focus).name}
              mission={state.mission}
              running={state.running}
              agents={state.agents}
              activeAgent={state.activeAgent}
              approval={state.approval}
              onApprove={approve}
              checks={state.checks}
              feed={state.feed}
              onOpenVerdict={() => setVerdictOpen(true)}
              hasVerdict={!!state.verdict}
            />
          </div>

          <div className="absolute bottom-3 left-3">
            <OrderPanel
              running={state.running}
              onDispatch={dispatchOrder}
              onHalt={() => void lane.halt()}
              approval={approvalMode}
              setApproval={setApprovalMode}
              pace={pace}
              setPace={setPace}
              inputRef={inputRef}
              focus={focus}
              setTarget={setTarget}
              suggestions={(world.islands?.[focus]?.questions ?? []).slice(0, 4).map((q) => q.question)}
            />
          </div>

          <div className="absolute bottom-3 right-3">
            <CrewBar agents={state.agents} activeAgent={state.activeAgent} follow={follow} onFollow={setFollow} />
          </div>

          <div className="absolute bottom-[86px] right-3 flex gap-1.5 pointer-events-auto">
            <HudKey k="?" label="Controls" onClick={() => setHelpOpen(true)} />
            {ids.length > 1 && <HudKey k="I" label={`Fly to ${islandMeta(nextIsland(focus)).short}`} onClick={() => flyTo(nextIsland(focus))} />}
            <HudKey k="O" label="Overview" onClick={overview} />
            <HudKey k="C" label="City Hall" onClick={() => { setFollow(null); goHome(); }} />
            <HudKey k="L" label={showLabels ? 'Labels on' : 'Labels off'} onClick={() => setShowLabels((v) => !v)} />
            <HudKey k="M" label={muted ? 'Muted' : 'Sound'} onClick={() => { sfx.setMuted(!muted); setMuted(!muted); }} />
            {follow && <HudKey k="Esc" label={`Following ${follow}`} onClick={() => setFollow(null)} />}
          </div>

          <div className="absolute top-[16%] left-1/2 -translate-x-1/2">
            <Toasts toasts={hint ? [...toasts, hint] : toasts} onDone={(id) => { if (hint?.id === id) setHint(null); else dismissToast(id); }} />
          </div>

          {verdictOpen && state.verdict && (
            <VerdictScreen
              verdict={state.verdict}
              xp={lastXp}
              onClose={() => setVerdictOpen(false)}
              onReplay={replay}
              canReplay={lane.canReplay && !state.running}
              onNew={() => { setVerdictOpen(false); setTimeout(() => inputRef.current?.focus(), 0); }}
            />
          )}
          {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
        </div>
      )}

      {!started && (
        <TitleScreen ready={world.ready} error={world.error} agents={world.agents} onStart={begin} onRetry={reload} onExit={onExit} />
      )}
    </div>
  );
}

function flightLabel(e: QuestEvent): string | null {
  switch (e.type) {
    case 'query.generated': return `DRAFT #${e.metadata?.attempt ?? 1}`;
    case 'query.execution_failed': return 'CRASHED ✗';
    case 'validation.check_failed': return `TRAP: ${String((e.metadata?.check as { label?: string })?.label ?? 'check').slice(0, 26)}`;
    case 'answer.approved': return 'SOLVED ✓';
    case 'answer.abstained': return 'REFUSED (honest)';
    default: return null;
  }
}

function IslandBar({ ids, focus, onPick, onOverview, running }: {
  ids: IslandId[]; focus: IslandId; onPick: (t: IslandId) => void; onOverview: () => void; running: Record<IslandId, boolean>;
}) {
  return (
    <div className="qp-panel !p-1 flex items-center gap-1">
      {ids.map((id) => {
        const m = islandMeta(id);
        const on = focus === id;
        return (
          <button
            key={id}
            onClick={() => onPick(id)}
            title={m.name}
            className="qp-btn text-[10px] px-3 py-1.5"
            style={on ? { background: m.color, color: '#0f172a', borderColor: '#f8fafc99' } : undefined}
          >
            <span className={running[id] ? 'qp-blink' : ''} style={on ? undefined : { color: m.color }}>●</span> {m.short}
          </button>
        );
      })}
      <button onClick={onOverview} className="qp-btn text-[10px] px-2 py-1.5" title="See all islands (O)">☁ <span className="qp-key ml-0.5">O</span></button>
    </div>
  );
}

function LiveDot({ live }: { live: { connected: boolean; pgListen: boolean; active: Record<string, unknown> } }) {
  const n = Object.keys(live.active).length;
  return (
    <div className="qp-panel !py-1 px-2 flex items-center gap-1.5 font-pixel text-[9px]" title={live.pgListen ? 'Live events from every tab and surface' : 'Live feed connecting'}>
      <span className={`w-2 h-2 rounded-full ${live.connected && live.pgListen ? 'bg-emerald-400 qp-blink' : live.connected ? 'bg-amber-400' : 'bg-red-500'}`} />
      <span className="text-slate-200">LIVE</span>
      {n > 0 && <span className="text-sky-300">{n} running</span>}
    </div>
  );
}

function CloudWipe() {
  const puffs = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    top: `${(i * 37) % 100 - 10}%`, size: 160 + ((i * 53) % 220), delay: (i % 5) * 0.05, left: `${(i * 23) % 40}vw`,
  })), []);
  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
      {puffs.map((p, i) => (
        <div key={i} className="qp-wipe-puff" style={{ top: p.top, left: p.left, width: p.size * 1.6, height: p.size, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}

function HudKey({ k, label, onClick }: { k: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="qp-btn text-[8.5px] px-2 py-1 !bg-slate-900/85">
      <span className="qp-key xl:mr-1">{k}</span><span className="hidden xl:inline">{label}</span>
    </button>
  );
}

export default function QuestGame({ onExit }: { onExit?: () => void }) {
  return (
    <GameProvider>
      <QuestGameInner onExit={onExit} />
    </GameProvider>
  );
}
