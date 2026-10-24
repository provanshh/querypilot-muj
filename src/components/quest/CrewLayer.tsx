'use client';

import React, { useEffect, useRef } from 'react';
import type { AgentId, WorldSchema } from '@/lib/quest/types';
import type { IslandLayout, GridPoint, Plot } from '@/lib/quest/island';
import { CREW, CREW_BY_ID } from '@/lib/quest/crew';
import { getSprite, ANCHOR_X, ANCHOR_Y, SPRITE_W, SPRITE_H } from '@/lib/quest/sprites';
import type { AgentState, RoadLink, TableMark } from './useQuest';

const TW = 64;
const TH = 64 * 0.6;
const WALK_SPEED = 3.6; // tiles per second
const TIER_HEIGHT = [0, 40, 66, 92, 116];

export interface Viewport {
  offset: { x: number; y: number };
  zoom: number;
  canvasSize: { width: number; height: number };
}

interface Runtime {
  x: number;
  y: number;
  path: GridPoint[];
  dest: string;
  facing: 'front' | 'back';
  flip: boolean;
  walk: number;
  moving: boolean;
}

interface CrewLayerProps {
  layout: IslandLayout;
  schema: WorldSchema;
  discovered: string[];
  agents: Record<AgentId, AgentState>;
  activeAgent: AgentId | null;
  marks: Record<string, TableMark>;
  links: RoadLink[];
  viewportRef: React.MutableRefObject<Viewport | null>;
  positionsRef: React.MutableRefObject<Partial<Record<AgentId, GridPoint>>>;
  showLabels: boolean;
  selectedTable: string | null;
}

export function CrewLayer(props: CrewLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const runtimeRef = useRef<Map<AgentId, Runtime>>(new Map());
  const pathCache = useRef<Map<string, GridPoint[]>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const rootStyle = getComputedStyle(document.documentElement);
    const pixelFont = rootStyle.getPropertyValue('--font-pixel').trim() || 'monospace';
    const monoFont = rootStyle.getPropertyValue('--font-mono').trim() || 'monospace';
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = propsRef.current;
      const vp = p.viewportRef.current;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = Math.round(rect.width * dpr);
      const H = Math.round(rect.height * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!vp) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const z = vp.zoom;
      const toScreen = (gx: number, gy: number) => ({
        x: ((gx - gy) * TW) / 2 * z + (TW / 2) * z + vp.offset.x,
        y: ((gx + gy) * TH) / 2 * z + (TH / 2) * z + vp.offset.y,
      });
      const t = now / 1000;

      stepAgents(p, runtimeRef.current, pathCache.current, dt);

      // Fog over uncharted districts
      for (const plot of Object.values(p.layout.plots)) {
        if (p.discovered.includes(plot.table)) continue;
        drawFog(ctx, plot, toScreen, z, t);
      }

      // Relationship roads lighting up
      const nowMs = Date.now();
      for (const link of p.links) {
        const age = nowMs - link.at;
        if (age > 3800) continue;
        const a = p.layout.plots[link.a];
        const b = p.layout.plots[link.b];
        if (!a || !b) continue;
        const path = roadPath(p.layout, a.entry, b.entry, pathCache.current);
        drawLink(ctx, path, toScreen, z, t, link.kind, 1 - Math.max(0, age - 2800) / 1000);
      }

      // Building markers & nameplates
      for (const plot of Object.values(p.layout.plots)) {
        if (!p.discovered.includes(plot.table)) continue;
        drawPlotMarks(ctx, plot, p.marks[plot.table], toScreen, z, t, nowMs);
      }
      if (p.showLabels) {
        drawHqLabel(ctx, p.layout.hq, toScreen, z, pixelFont);
        for (const plot of Object.values(p.layout.plots)) {
          const table = p.schema.tables.find((x) => x.name === plot.table);
          drawNameplate(ctx, plot, table?.rowCount ?? 0, p.discovered.includes(plot.table), p.marks[plot.table], p.selectedTable === plot.table, toScreen, z, pixelFont, t);
        }
      }

      // Crew, depth-sorted
      const sorted = [...runtimeRef.current.entries()].sort((a, b) => a[1].x + a[1].y - (b[1].x + b[1].y));
      for (const [id, rt] of sorted) {
        p.positionsRef.current[id] = { x: rt.x, y: rt.y };
        drawAgent(ctx, id, rt, p.agents[id], p.activeAgent === id, toScreen, z, t, pixelFont, monoFont, nowMs);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/* ------------------------------------------------------------------------- */
/* Movement                                                                   */
/* ------------------------------------------------------------------------- */

function destinationFor(layout: IslandLayout, target: string): GridPoint {
  if (target === '__hq__') return layout.hq.entry;
  return layout.plots[target]?.entry ?? layout.hq.entry;
}

const SLOT_OFFSETS = [0, -1, 1, -2, 2, -1.5, 1.5];

function stepAgents(p: CrewLayerProps, rts: Map<AgentId, Runtime>, cache: Map<string, GridPoint[]>, dt: number) {
  // Who is heading where, for slotting crew members side by side on the road
  const byDest = new Map<string, AgentId[]>();
  for (const c of CREW) {
    const target = c.id === 'mayor' ? '__hq__' : p.agents[c.id]?.target ?? '__hq__';
    if (!byDest.has(target)) byDest.set(target, []);
    byDest.get(target)!.push(c.id);
  }

  for (const c of CREW) {
    const target = c.id === 'mayor' ? '__hq__' : p.agents[c.id]?.target ?? '__hq__';
    const slot = byDest.get(target)!.indexOf(c.id);
    const base = destinationFor(p.layout, target);
    const off = SLOT_OFFSETS[slot % SLOT_OFFSETS.length] * 0.55;
    const goal = { x: base.x, y: base.y + off };
    let rt = rts.get(c.id);
    if (!rt) {
      const hq = destinationFor(p.layout, '__hq__');
      const i = CREW.indexOf(c);
      rt = { x: hq.x, y: hq.y + SLOT_OFFSETS[i % SLOT_OFFSETS.length] * 0.55, path: [], dest: '__hq__', facing: 'front', flip: false, walk: 0, moving: false };
      rts.set(c.id, rt);
    }
    const destKey = `${target}#${slot}`;
    if (rt.dest !== destKey) {
      rt.dest = destKey;
      const from = { x: Math.round(rt.x), y: Math.round(rt.y) };
      const route = roadPath(p.layout, from, base, cache);
      rt.path = [...route.slice(1), goal];
    }
    if (!rt.path.length) { rt.moving = false; rt.walk = 0; continue; }
    const next = rt.path[0];
    const dx = next.x - rt.x;
    const dy = next.y - rt.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = WALK_SPEED * dt;
    if (dist <= stepLen) {
      rt.x = next.x; rt.y = next.y; rt.path.shift();
    } else {
      rt.x += (dx / dist) * stepLen;
      rt.y += (dy / dist) * stepLen;
    }
    rt.moving = rt.path.length > 0;
    if (dist > 0.001) {
      // Screen direction: +x → down-right, +y → down-left
      const sx = dx - dy;
      const sy = dx + dy;
      rt.facing = sy >= 0 ? 'front' : 'back';
      rt.flip = sx < 0;
    }
    rt.walk += dt * 8;
  }
}

function roadPath(layout: IslandLayout, from: GridPoint, to: GridPoint, cache: Map<string, GridPoint[]>): GridPoint[] {
  const key = `${from.x},${from.y}>${to.x},${to.y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const N = layout.size;
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && layout.road[y][x];
  const start = isRoad(from.x, from.y) ? from : nearestRoad(layout, from);
  const prev = new Map<string, string>();
  const q: GridPoint[] = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  let found = false;
  while (q.length) {
    const cur = q.shift()!;
    if (cur.x === to.x && cur.y === to.y) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !isRoad(nx, ny)) continue;
      seen.add(k);
      prev.set(k, `${cur.x},${cur.y}`);
      q.push({ x: nx, y: ny });
    }
  }
  let path: GridPoint[];
  if (!found) path = [from, to];
  else {
    path = [];
    let k: string | undefined = `${to.x},${to.y}`;
    while (k) {
      const [x, y] = k.split(',').map(Number);
      path.unshift({ x, y });
      k = prev.get(k);
    }
    if (start !== from) path.unshift(from);
  }
  cache.set(key, path);
  return path;
}

function nearestRoad(layout: IslandLayout, p: GridPoint): GridPoint {
  let best = layout.hq.entry;
  let bd = Infinity;
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (!layout.road[y][x]) continue;
      const d = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

/* ------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* ------------------------------------------------------------------------- */

type ToScreen = (gx: number, gy: number) => { x: number; y: number };

function footprint(plot: Plot, toScreen: ToScreen) {
  const top = toScreen(plot.x - 0.5, plot.y - 0.5);
  const right = toScreen(plot.x + plot.w - 0.5, plot.y - 0.5);
  const bottom = toScreen(plot.x + plot.w - 0.5, plot.y + plot.h - 0.5);
  const left = toScreen(plot.x - 0.5, plot.y + plot.h - 0.5);
  return { top, right, bottom, left, cx: (left.x + right.x) / 2, cy: (top.y + bottom.y) / 2 };
}

function diamond(ctx: CanvasRenderingContext2D, f: ReturnType<typeof footprint>, grow = 0) {
  ctx.beginPath();
  ctx.moveTo(f.top.x, f.top.y - grow);
  ctx.lineTo(f.right.x + grow * 2, f.right.y);
  ctx.lineTo(f.bottom.x, f.bottom.y + grow);
  ctx.lineTo(f.left.x - grow * 2, f.left.y);
  ctx.closePath();
}

function drawFog(ctx: CanvasRenderingContext2D, plot: Plot, toScreen: ToScreen, z: number, t: number) {
  const f = footprint(plot, toScreen);
  const puffs = 7;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + t * 0.15;
    const r = (18 + (i % 3) * 6) * z;
    const x = f.cx + Math.cos(a) * 22 * z * (plot.w * 0.8);
    const y = f.cy - 18 * z + Math.sin(a) * 9 * z * plot.h - Math.sin(t + i) * 2 * z;
    ctx.fillStyle = i % 2 ? 'rgba(226,232,240,0.88)' : 'rgba(203,213,225,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(241,245,249,0.95)';
  ctx.beginPath();
  ctx.arc(f.cx, f.cy - 22 * z, 24 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.font = `bold ${Math.max(10, 18 * z)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', f.cx, f.cy - 22 * z);
  ctx.restore();
}

function drawLink(ctx: CanvasRenderingContext2D, path: GridPoint[], toScreen: ToScreen, z: number, t: number, kind: RoadLink['kind'], alpha: number) {
  if (path.length < 2) return;
  const color = kind === 'join' ? '251,191,36' : '34,211,238';
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach((pt, i) => {
    const s = toScreen(pt.x, pt.y);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  ctx.strokeStyle = `rgba(${color},0.35)`;
  ctx.lineWidth = 10 * z;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${color},0.95)`;
  ctx.lineWidth = 3 * z;
  ctx.setLineDash([8 * z, 8 * z]);
  ctx.lineDashOffset = -t * 40 * z;
  ctx.stroke();
  ctx.setLineDash([]);
  // Data packets riding the road
  const total = path.length - 1;
  for (let k = 0; k < 3; k++) {
    const u = ((t * 0.6 + k / 3) % 1) * total;
    const i = Math.floor(u);
    const f = u - i;
    const a = path[i];
    const b = path[Math.min(i + 1, total)];
    const s = toScreen(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    ctx.fillStyle = `rgb(${color})`;
    ctx.fillRect(s.x - 3 * z, s.y - 3 * z, 6 * z, 6 * z);
  }
  ctx.restore();
}

function drawPlotMarks(ctx: CanvasRenderingContext2D, plot: Plot, m: TableMark | undefined, toScreen: ToScreen, z: number, t: number, nowMs: number) {
  if (!m) return;
  const f = footprint(plot, toScreen);
  ctx.save();
  const activeFor = nowMs - m.activityAt;
  if (m.activity && activeFor < 6000) {
    const colors: Record<string, string> = { scan: '34,211,238', inspect: '167,139,250', query: '251,146,60', verify: '52,211,153', analyze: '244,114,182' };
    const c = colors[m.activity] ?? '255,255,255';
    const pulse = (Math.sin(t * 6) + 1) / 2;
    ctx.strokeStyle = `rgba(${c},${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 3 * z;
    diamond(ctx, f, 4 * z + pulse * 4 * z);
    ctx.stroke();
    ctx.fillStyle = `rgba(${c},0.12)`;
    diamond(ctx, f, 2 * z);
    ctx.fill();
  }
  if (nowMs - m.failedAt < 1600) {
    ctx.fillStyle = `rgba(239,68,68,${0.45 * (1 - (nowMs - m.failedAt) / 1600)})`;
    diamond(ctx, f, 6 * z);
    ctx.fill();
  }
  if (m.certified) {
    ctx.strokeStyle = 'rgba(52,211,153,0.9)';
    ctx.lineWidth = 2.5 * z;
    ctx.setLineDash([5 * z, 4 * z]);
    diamond(ctx, f, 8 * z);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHqLabel(ctx: CanvasRenderingContext2D, hq: Plot, toScreen: ToScreen, z: number, font: string) {
  const f = footprint(hq, toScreen);
  const y = f.cy - 96 * z;
  const s = Math.max(0.75, Math.min(1.15, z));
  ctx.save();
  ctx.font = `700 ${10 * s}px ${font}`;
  const text = 'CITY HALL · CREW HQ';
  const w = ctx.measureText(text).width + 16 * s;
  ctx.fillStyle = 'rgba(15,23,42,0.92)';
  roundRect(ctx, f.cx - w / 2, y - 10 * s, w, 20 * s, 3);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, f.cx, y + 1);
  ctx.restore();
}

function drawNameplate(
  ctx: CanvasRenderingContext2D, plot: Plot, rows: number, discovered: boolean, m: TableMark | undefined,
  selected: boolean, toScreen: ToScreen, z: number, font: string, t: number,
) {
  const f = footprint(plot, toScreen);
  const h = TIER_HEIGHT[plot.tier] * z;
  const y = f.cy - h - 18 * z;
  const s = Math.max(0.75, Math.min(1.15, z));
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const name = discovered ? plot.table : 'UNCHARTED';
  ctx.font = `700 ${11 * s}px ${font}`;
  const nameW = ctx.measureText(name).width;
  ctx.font = `400 ${9 * s}px ${font}`;
  const sub = discovered ? `${rows} ROWS` : '???';
  const subW = ctx.measureText(sub).width;
  const pad = 7 * s;
  const w = nameW + subW + pad * 3 + 6 * s;
  const bh = 20 * s;
  const x = f.cx - w / 2;
  const bob = m?.issues.length ? Math.sin(t * 4) * 1.5 : 0;

  ctx.fillStyle = selected ? 'rgba(120,53,15,0.95)' : 'rgba(15,23,42,0.9)';
  roundRect(ctx, x, y - bh / 2, w, bh, 3);
  ctx.fill();
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.strokeStyle = selected ? '#fbbf24' : m?.certified ? '#34d399' : m?.relevant ? '#22d3ee' : 'rgba(148,163,184,0.6)';
  ctx.stroke();
  // pointer
  ctx.beginPath();
  ctx.moveTo(f.cx - 5 * s, y + bh / 2);
  ctx.lineTo(f.cx + 5 * s, y + bh / 2);
  ctx.lineTo(f.cx, y + bh / 2 + 6 * s);
  ctx.closePath();
  ctx.fillStyle = selected ? 'rgba(120,53,15,0.95)' : 'rgba(15,23,42,0.9)';
  ctx.fill();

  ctx.fillStyle = discovered ? '#f8fafc' : '#94a3b8';
  ctx.font = `700 ${11 * s}px ${font}`;
  ctx.fillText(name, x + pad, y + 1);
  ctx.fillStyle = '#fbbf24';
  ctx.font = `400 ${9 * s}px ${font}`;
  ctx.fillText(sub, x + pad * 2 + nameW, y + 1);

  // Badges
  let bx = x + w + 4 * s;
  if (m?.issues.length) {
    ctx.fillStyle = '#ef4444';
    roundRect(ctx, bx, y - 9 * s + bob, 18 * s, 18 * s, 9 * s);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${10 * s}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(`!${m.issues.length > 1 ? m.issues.length : ''}`, bx + 9 * s, y + 1 + bob);
    bx += 22 * s;
  }
  if (m?.certified) {
    ctx.fillStyle = '#10b981';
    roundRect(ctx, bx, y - 9 * s, 18 * s, 18 * s, 9 * s);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 5 * s, y);
    ctx.lineTo(bx + 8 * s, y + 4 * s);
    ctx.lineTo(bx + 13 * s, y - 4 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAgent(
  ctx: CanvasRenderingContext2D, id: AgentId, rt: Runtime, st: AgentState | undefined, active: boolean,
  toScreen: ToScreen, z: number, t: number, pixelFont: string, monoFont: string, nowMs: number,
) {
  const member = CREW_BY_ID[id];
  const s = toScreen(rt.x, rt.y);
  const scale = Math.max(1.2, 1.55 * z);
  const frame = rt.moving ? (Math.floor(rt.walk) % 4 === 1 ? 1 : Math.floor(rt.walk) % 4 === 3 ? 2 : 0) : 0;
  const hop = rt.moving ? Math.abs(Math.sin(rt.walk * Math.PI / 2)) * 1.5 * scale : st?.mood === 'success' ? Math.abs(Math.sin(t * 5)) * 3 * scale : 0;
  const sprite = getSprite(member, rt.facing, frame);

  ctx.save();
  // Shadow
  ctx.fillStyle = 'rgba(15,23,42,0.35)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 1, 6 * scale, 2.6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // Active ring
  if (active) {
    ctx.strokeStyle = member.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 1, 9 * scale + Math.sin(t * 6) * 1.5, 4 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.translate(s.x, s.y - hop);
  if (rt.flip) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -ANCHOR_X * scale, -ANCHOR_Y * scale, SPRITE_W * scale, SPRITE_H * scale);
  ctx.restore();

  const headY = s.y - hop - (SPRITE_H + 3) * scale;

  // Mood icon
  if (st && st.mood !== 'idle') drawMood(ctx, st.mood, s.x + 7 * scale, headY + 2 * scale, scale, t);

  // Name tag
  ctx.save();
  ctx.font = `700 ${Math.max(8, 8 * Math.min(1.2, z))}px ${pixelFont}`;
  const label = member.name.split(' ')[0].toUpperCase();
  const tw = ctx.measureText(label).width + 8;
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  roundRect(ctx, s.x - tw / 2, headY - 13, tw, 12, 2);
  ctx.fill();
  ctx.fillStyle = member.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, s.x, headY - 6.5);
  ctx.restore();

  // Speech bubble (recent lines, or the active speaker)
  if (st?.say) {
    const age = nowMs - st.sayAt;
    const visible = age < (active ? 6500 : 3200);
    if (visible) drawBubble(ctx, st.say, s.x, headY - 18, member.color, monoFont, Math.min(1, (active ? 6500 : 3200) - age) / 1);
  }
}

function drawMood(ctx: CanvasRenderingContext2D, mood: AgentState['mood'], x: number, y: number, s: number, t: number) {
  ctx.save();
  const r = 5 * s;
  const colors: Record<string, string> = { think: '#e2e8f0', work: '#fbbf24', alert: '#ef4444', success: '#10b981', fail: '#ef4444', wait: '#93c5fd' };
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[mood] ?? '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.5, s);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${7 * s}px monospace`;
  if (mood === 'work') {
    for (let i = 0; i < 3; i++) {
      const on = Math.floor(t * 4) % 3 === i;
      ctx.fillRect(x - 3 * s + i * 2.4 * s, y - (on ? 1.2 : 0.5) * s, 1.4 * s, 1.4 * s);
    }
  } else if (mood === 'alert' || mood === 'fail') {
    ctx.fillStyle = '#fff';
    ctx.fillText(mood === 'alert' ? '!' : '×', x, y + 0.5);
  } else if (mood === 'success') {
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 2.5 * s, y);
    ctx.lineTo(x - 0.5 * s, y + 2 * s);
    ctx.lineTo(x + 2.8 * s, y - 2 * s);
    ctx.stroke();
  } else if (mood === 'think') {
    ctx.fillText('?', x, y + 0.5);
  } else if (mood === 'wait') {
    ctx.fillText('…', x, y);
  }
  ctx.restore();
}

function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `500 11px ${font}`;
  const maxW = 210;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && line) lines.push(line);
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) lines[1] = `${lines[1].replace(/\s+\S*$/, '')}…`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
  const h = lines.length * 14 + 8;
  const bx = x - w / 2;
  const by = y - h - 6;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(ctx, bx, by, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, by + h);
  ctx.lineTo(x + 5, by + h);
  ctx.lineTo(x, by + h + 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, bx + 7, by + 5 + i * 14));
  ctx.restore();
}
