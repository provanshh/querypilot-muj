import type { CrewMember } from './crew';

/**
 * Procedural pixel-art crew sprites. Each frame is rendered once into a small
 * offscreen canvas (1 unit = 1 art pixel) with a dark outline, then scaled up
 * with smoothing disabled for a crisp retro look.
 */

export const SPRITE_W = 16;
export const SPRITE_H = 24;
/** Feet anchor inside the sprite canvas */
export const ANCHOR_X = 8;
export const ANCHOR_Y = 23;

type Facing = 'front' | 'back';

const cache = new Map<string, HTMLCanvasElement>();

export function getSprite(member: CrewMember, facing: Facing, frame: number, portrait = false): HTMLCanvasElement {
  const key = `${member.id}:${facing}:${frame}:${portrait ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const art = document.createElement('canvas');
  art.width = SPRITE_W;
  art.height = SPRITE_H;
  const a = art.getContext('2d')!;
  drawBody(a, member, facing, frame);

  // Outline pass
  const out = document.createElement('canvas');
  out.width = SPRITE_W;
  out.height = SPRITE_H;
  const o = out.getContext('2d')!;
  const sil = document.createElement('canvas');
  sil.width = SPRITE_W;
  sil.height = SPRITE_H;
  const s = sil.getContext('2d')!;
  s.drawImage(art, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#0b1020';
  s.fillRect(0, 0, SPRITE_W, SPRITE_H);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(sil, dx, dy);
  o.drawImage(art, 0, 0);
  cache.set(key, out);
  return out;
}

function drawBody(ctx: CanvasRenderingContext2D, m: CrewMember, facing: Facing, frame: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const P = m.palette;
  const front = facing === 'front';
  // Walk cycle: 0 idle, 1 left step, 2 right step
  const legL = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  const legR = -legL;
  const bob = frame === 0 ? 0 : 0;

  // Legs & boots (y 17..23)
  p(5, 17 + bob, 3, 4 + Math.max(0, legL), P.pants);
  p(8, 17 + bob, 3, 4 + Math.max(0, legR), P.pants);
  p(5, 21 + Math.max(0, legL), 3, 2, P.boots);
  p(8, 21 + Math.max(0, legR), 3, 2, P.boots);

  // Torso (y 10..17)
  p(4, 10, 8, 7, P.shirt);
  p(4, 15, 8, 2, P.shirtShade);
  if (front) p(7, 10, 2, 5, P.shirtShade);
  // Arms
  const armSwing = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  p(2, 11 + armSwing, 2, 5, P.shirt);
  p(12, 11 - armSwing, 2, 5, P.shirt);
  p(2, 16 + armSwing, 2, 1, P.skin);
  p(12, 16 - armSwing, 2, 1, P.skin);

  // Head (y 3..10)
  p(5, 4, 6, 6, P.skin);
  p(4, 5, 1, 4, P.skin);
  p(11, 5, 1, 4, P.skin);
  if (front) {
    p(5, 4, 6, 1, P.hair);
    p(6, 6, 1, 1, '#0f172a');
    p(9, 6, 1, 1, '#0f172a');
    p(7, 8, 2, 1, '#9a3412');
  } else {
    p(4, 4, 8, 5, P.hair);
  }

  // Hats
  switch (m.hat) {
    case 'tophat':
      p(3, 3, 10, 1, P.hat);
      p(5, -1 + 1, 6, 3, P.hat);
      p(5, 2, 6, 1, P.hatAccent);
      break;
    case 'ranger':
      p(2, 3, 12, 1, P.hat);
      p(4, 1, 8, 2, P.hat);
      p(4, 2, 8, 1, P.hatAccent);
      break;
    case 'deerstalker':
      p(4, 2, 8, 2, P.hat);
      p(3, 3, 10, 1, P.hatAccent);
      p(5, 1, 6, 1, P.hat);
      break;
    case 'hardhat':
      p(4, 2, 8, 2, P.hat);
      p(3, 3, 10, 1, P.hatAccent);
      p(7, 1, 2, 1, P.hat);
      break;
    case 'cap':
      p(4, 2, 8, 2, P.hat);
      if (front) p(4, 4, 8, 1, '#0f172a');
      p(7, 2, 2, 1, P.hatAccent);
      break;
    case 'none':
      p(4, 3, 8, 2, P.hair);
      p(3, 4, 1, 4, P.hair);
      p(12, 4, 1, 4, P.hair);
      if (front) {
        p(5, 6, 2, 1, '#e5e7eb');
        p(8, 6, 2, 1, '#e5e7eb');
      }
      break;
  }

  // Props (front only, held in right hand)
  if (!front) return;
  switch (m.prop) {
    case 'sash':
      p(5, 10, 1, 1, P.prop); p(6, 11, 1, 1, P.prop); p(7, 12, 1, 1, P.prop); p(8, 13, 1, 1, P.prop); p(9, 14, 1, 1, P.prop);
      p(7, 11, 2, 1, '#fde047');
      break;
    case 'binoculars':
      p(6, 11, 2, 2, P.prop); p(8, 11, 2, 2, P.prop);
      break;
    case 'magnifier':
      p(13, 13, 3, 3, P.prop); p(14, 14, 1, 1, '#93c5fd'); p(12, 16, 1, 2, '#78350f');
      break;
    case 'wrench':
      p(13, 12, 1, 5, P.prop); p(12, 11, 3, 1, P.prop);
      p(4, 11, 8, 1, '#facc15');
      break;
    case 'clipboard':
      p(12, 12, 4, 5, '#a16207'); p(13, 13, 2, 3, P.prop); p(13, 12, 2, 1, '#94a3b8');
      p(9, 11, 2, 2, '#fbbf24');
      break;
    case 'tie':
      p(7, 10, 2, 1, '#fdf2f8'); p(7, 11, 2, 4, P.prop);
      break;
  }
}

/** Portrait (head + shoulders) for HUD cards, returned as a data URL. */
const portraitCache = new Map<string, string>();
export function portraitUrl(member: CrewMember, scale = 4): string {
  const key = `${member.id}:${scale}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const sprite = getSprite(member, 'front', 0);
  const c = document.createElement('canvas');
  c.width = SPRITE_W * scale;
  c.height = 17 * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, SPRITE_W, 17, 0, 0, SPRITE_W * scale, 17 * scale);
  const url = c.toDataURL();
  portraitCache.set(key, url);
  return url;
}
