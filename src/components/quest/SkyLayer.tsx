'use client';

import React, { useEffect, useRef } from 'react';
import type { IslandId } from '@/lib/quest/types';
import { SEA_MID, type WorldLayout } from '@/lib/quest/island';
import type { Viewport } from './CrewLayer';

const TW = 64;
const TH = 64 * 0.6;

function project(vp: Viewport, gx: number, gy: number) {
  return {
    x: ((gx - gy) * TW) / 2 * vp.zoom + (TW / 2) * vp.zoom + vp.offset.x,
    y: ((gx + gy) * TH) / 2 * vp.zoom + (TH / 2) * vp.zoom + vp.offset.y,
  };
}

export interface Flight {
  id: number;
  from: IslandId;
  label: string;
  color: string;
  start: number;
  dur: number;
}

/** Planes carrying each island's results out over the sea, plus ambient sky traffic and clouds. */
export function SkyLayer({ layout, viewportRef, flightsRef }: {
  layout: WorldLayout;
  viewportRef: React.MutableRefObject<Viewport | null>;
  flightsRef: React.MutableRefObject<Flight[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim() || 'monospace';
    let raf = 0;
    const clouds = Array.from({ length: 9 }, (_, i) => ({
      gx: (i * 23) % 86, gy: (i * 41) % 86, r: 1 + (i % 3) * 0.5, speed: 0.25 + (i % 4) * 0.08,
    }));

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const vp = viewportRef.current;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = Math.round(rect.width * dpr);
      const H = Math.round(rect.height * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!vp) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const z = vp.zoom;
      const t = now / 1000;
      const L = layoutRef.current;
      const alt = 150 * z;

      // Drifting clouds over the sea
      for (const c of clouds) {
        const gx = ((c.gx + t * c.speed) % 98) - 6;
        const p = project(vp, gx, c.gy);
        drawPuff(ctx, p.x, p.y - alt * 1.3, 34 * z * c.r, 0.55);
      }

      // The comparison cloud at mid-sea
      const mid = project(vp, SEA_MID.x, SEA_MID.y);
      drawPuff(ctx, mid.x, mid.y - alt, 120 * z, 0.92);

      // Ambient planes looping between the islands
      for (let k = 0; k < 2; k++) {
        const u = (t * 0.035 + k * 0.5) % 1;
        const a = u * Math.PI * 2;
        const gx = SEA_MID.x + Math.cos(a) * 30;
        const gy = SEA_MID.y + Math.sin(a) * 30;
        const p = project(vp, gx, gy);
        const n = project(vp, SEA_MID.x + Math.cos(a + 0.02) * 30, SEA_MID.y + Math.sin(a + 0.02) * 30);
        drawPlane(ctx, p.x, p.y - alt * 1.6, Math.atan2(n.y - p.y, n.x - p.x), Math.max(0.5, z) * 0.9, '#e2e8f0', null, font);
      }

      // Data flights: island HQ → comparison cloud
      const flights = flightsRef.current;
      const nowMs = Date.now();
      flightsRef.current = flights.filter((f) => nowMs - f.start < f.dur + 400);
      for (const f of flightsRef.current) {
        const k = Math.min(1, (nowMs - f.start) / f.dur);
        const hq = L.islands[f.from].hq;
        const a = project(vp, hq.x + 0.5, hq.y + 0.5);
        const home = project(vp, L.islands[f.from].center.x, L.islands[f.from].center.y);
        const b = { x: mid.x + Math.sign(home.x - mid.x) * 40 * z, y: mid.y - alt };
        const lift = Math.sin(k * Math.PI) * 60 * z;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const ay = a.y - 40 * z;
        const x = a.x + (b.x - a.x) * e;
        const y = ay + (b.y - ay) * e - lift;
        const k2 = Math.min(1, k + 0.01);
        const e2 = k2 < 0.5 ? 2 * k2 * k2 : 1 - Math.pow(-2 * k2 + 2, 2) / 2;
        const x2 = a.x + (b.x - a.x) * e2;
        const y2 = ay + (b.y - ay) * e2 - Math.sin(k2 * Math.PI) * 60 * z;
        // contrail
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3 * Math.max(0.6, z);
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        for (let s = 0; s <= 12; s++) {
          const kk = Math.max(0, k - s * 0.015);
          const ee = kk < 0.5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
          const px = a.x + (b.x - a.x) * ee;
          const py = ay + (b.y - ay) * ee - Math.sin(kk * Math.PI) * 60 * z;
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
        const fade = k >= 1 ? Math.max(0, 1 - (nowMs - f.start - f.dur) / 400) : 1;
        ctx.globalAlpha = fade;
        drawPlane(ctx, x, y, Math.atan2(y2 - y, x2 - x), Math.max(0.7, z * 1.2), f.color, f.label, font);
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [viewportRef, flightsRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const blobs: [number, number, number][] = [[0, 0, 1], [-0.75, 0.18, 0.7], [0.75, 0.18, 0.72], [-0.35, -0.3, 0.68], [0.38, -0.25, 0.62], [0, 0.3, 0.8]];
  ctx.fillStyle = 'rgba(148,163,184,0.35)';
  for (const [dx, dy, s] of blobs) { ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r * 0.5 + r * 0.12, s * r * 0.62, s * r * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffffff';
  for (const [dx, dy, s] of blobs) { ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r * 0.5, s * r * 0.6, s * r * 0.38, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, s: number, color: string, label: string | null, font: string) {
  ctx.save();
  // shadow on the sea
  ctx.fillStyle = 'rgba(15,23,42,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 70 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  const flip = Math.cos(angle) < 0;
  ctx.rotate(angle * 0.35);
  if (flip) ctx.scale(-1, 1);
  const px = (gx: number, gy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(gx * s, gy * s, w * s, h * s); };
  // fuselage
  px(-14, -3, 26, 6, '#f8fafc');
  px(12, -2, 4, 4, '#cbd5e1');
  px(-14, -3, 26, 2, '#ffffff');
  px(-16, -7, 5, 5, color); // tail fin
  px(-3, -1, 9, 3, '#94a3b8'); // wing root
  px(-4, 1, 6, 8, color); // wing
  for (let i = 0; i < 4; i++) px(-8 + i * 5, -2, 2, 2, '#38bdf8'); // windows
  ctx.restore();
  if (label) {
    ctx.save();
    ctx.font = `700 ${Math.max(8, 9 * Math.min(1.2, s))}px ${font}`;
    const w = ctx.measureText(label).width + 10;
    const bx = flip ? x + 18 * s : x - 18 * s - w;
    // banner rope
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + (flip ? 14 : -14) * s, y);
    ctx.lineTo(flip ? bx : bx + w, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(15,23,42,0.9)';
    ctx.fillRect(bx, y - 8, w, 16);
    ctx.strokeStyle = color;
    ctx.strokeRect(bx + 0.5, y - 7.5, w - 1, 15);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 5, y + 1);
    ctx.restore();
  }
}
