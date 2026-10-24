import type { Tile, BuildingType, Building } from '@/types/game';
import type { IslandId, WorldSchema } from './types';

/**
 * Up to three islands in one sea, one per uploaded dataset: the first on the left of the screen,
 * the second on the right and the third below, with open water in the middle for the data planes.
 */
const WORLD_SIZE = 86;
const ISLAND_R = 16.6;
/** Must exceed √180 ≈ 13.42 so the outer block corners (6,12) count as city roads. */
const CITY_R = 13.5;
const BLOCK = 6;

type IslandStyle = 'town' | 'market' | 'downtown';
const SLOTS: { center: GridPoint; style: IslandStyle; seed: number }[] = [
  { center: { x: 20, y: 62 }, style: 'town', seed: 7331 },
  { center: { x: 62, y: 20 }, style: 'market', seed: 4242 },
  { center: { x: 64, y: 64 }, style: 'downtown', seed: 9917 },
];
export const MAX_ISLANDS = SLOTS.length;
/** Mid-sea point between the islands (screen centre of the overview). */
export const SEA_MID: GridPoint = { x: 49, y: 49 };

export interface GridPoint { x: number; y: number }

export interface Plot {
  table: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: BuildingType;
  tier: 1 | 2 | 3 | 4;
  /** Road tile where crew members stand when working on this table */
  entry: GridPoint;
}

export interface IslandLayout {
  id: IslandId;
  center: GridPoint;
  /** World size (all coordinates are absolute world tiles). */
  size: number;
  hq: Plot;
  plots: Record<string, Plot>;
  road: boolean[][];
  /** Every scenery building tile (houses, shops, factories) — each one stands for a row. */
  scenery: GridPoint[];
}

export interface WorldLayout {
  size: number;
  grid: Tile[][];
  islands: Record<IslandId, IslandLayout>;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function building(type: BuildingType, extra: Partial<Building> = {}): Building {
  return {
    type,
    level: type === 'grass' || type === 'water' || type === 'empty' || type === 'road' || type === 'tree' ? 0 : 3,
    population: 0,
    jobs: 0,
    powered: true,
    watered: true,
    onFire: false,
    fireProgress: 0,
    age: 20,
    constructionProgress: 100,
    abandoned: false,
    ...extra,
  };
}

function tile(x: number, y: number, type: BuildingType, extra: Partial<Building> = {}): Tile {
  return { x, y, zone: 'none', building: building(type, extra), landValue: 50, pollution: 0, crime: 0, traffic: 0, hasSubway: false };
}

function tierFor(rowCount: number): Plot['tier'] {
  if (rowCount <= 12) return 1;
  if (rowCount <= 60) return 2;
  if (rowCount <= 150) return 3;
  return 4;
}

/** Each table becomes a landmark that fits the island's style: civic buildings, markets, office towers. */
const TIER_TYPE: Record<IslandStyle, Record<Plot['tier'], { type: BuildingType; size: number }>> = {
  town: {
    1: { type: 'community_center', size: 1 },
    2: { type: 'school', size: 2 },
    3: { type: 'school', size: 2 },
    4: { type: 'hospital', size: 2 },
  },
  market: {
    1: { type: 'shop_medium', size: 1 },
    2: { type: 'greenhouse_garden', size: 2 },
    3: { type: 'apartment_low', size: 2 },
    4: { type: 'warehouse', size: 2 },
  },
  downtown: {
    1: { type: 'office_building_small', size: 1 },
    2: { type: 'office_low', size: 2 },
    3: { type: 'office_high', size: 2 },
    4: { type: 'office_high', size: 2 },
  },
};

const NON_BUILDINGS = new Set<BuildingType>(['grass', 'water', 'empty', 'road', 'tree', 'park', 'bridge', 'rail']);

export function generateWorld(schemas: WorldSchema[]): WorldLayout {
  const N = WORLD_SIZE;
  const grid: Tile[][] = [];
  for (let y = 0; y < N; y++) {
    grid[y] = [];
    for (let x = 0; x < N; x++) grid[y][x] = tile(x, y, 'water');
  }
  const islands = Object.fromEntries(schemas.slice(0, MAX_ISLANDS).map((s, i) => [s.id, buildIsland(grid, s.id, s, SLOTS[i])])) as Record<IslandId, IslandLayout>;
  return { size: N, grid, islands };
}

function buildIsland(grid: Tile[][], id: IslandId, schema: WorldSchema, slot: typeof SLOTS[number]): IslandLayout {
  const N = grid.length;
  const { x: CX, y: CY } = slot.center;
  const { style } = slot;
  const rand = rng(slot.seed);
  const road: boolean[][] = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
  const leafy = style !== 'downtown';

  const angleNoise = Array.from({ length: 24 }, () => rand() * 2.2 - 1.1);
  const landAt = (x: number, y: number) => {
    const dx = x - CX + 0.5;
    const dy = y - CY + 0.5;
    const d = Math.hypot(dx, dy);
    const a = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 24;
    const i = Math.floor(a) % 24;
    const t = a - Math.floor(a);
    const n = angleNoise[i] * (1 - t) + angleNoise[(i + 1) % 24] * t;
    return d < ISLAND_R + n;
  };
  const near = (x: number, y: number) => Math.abs(x - CX) <= ISLAND_R + 2 && Math.abs(y - CY) <= ISLAND_R + 2;

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (near(x, y) && landAt(x, y)) grid[y][x] = tile(x, y, 'grass');

  const isRoadLine = (v: number, c: number) => (v - c) % BLOCK === 0;
  const inCity = (x: number, y: number) => Math.hypot(x - CX, y - CY) <= CITY_R && landAt(x, y);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!near(x, y)) continue;
      if ((isRoadLine(x, CX) || isRoadLine(y, CY)) && inCity(x, y)) {
        grid[y][x] = tile(x, y, 'road');
        road[y][x] = true;
      }
    }
  }

  type Block = { i: number; j: number; x0: number; y0: number };
  const blocks: Block[] = [];
  for (let i = -3; i <= 2; i++) {
    for (let j = -3; j <= 2; j++) {
      const x0 = CX + i * BLOCK + 1;
      const y0 = CY + j * BLOCK + 1;
      const corners = [[x0 - 1, y0 - 1], [x0 + 5, y0 - 1], [x0 - 1, y0 + 5], [x0 + 5, y0 + 5]];
      if (corners.every(([cx, cy]) => road[cy]?.[cx])) blocks.push({ i, j, x0, y0 });
    }
  }

  const used = new Set<string>();
  const key = (b: Block) => `${b.i},${b.j}`;
  const blockDist = (a: Block, b: Block) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
  const centerDist = (b: Block) => Math.hypot(b.i + 0.5, b.j + 0.5);

  const hqBlock = blocks.find((b) => b.i === 0 && b.j === 0) ?? blocks[0];
  used.add(key(hqBlock));
  const hq: Plot = {
    table: '__hq__', x: hqBlock.x0 + 1, y: hqBlock.y0 + 1, w: 2, h: 2, type: 'city_hall', tier: 4,
    entry: { x: hqBlock.x0 - 1, y: hqBlock.y0 + 2 },
  };
  placeFootprint(grid, hq.x, hq.y, 2, 2, 'city_hall');
  decorateCampus(grid, hqBlock.x0, hqBlock.y0, hq, rand, true, leafy);

  const degree = new Map<string, number>();
  schema.relationships.forEach((r) => {
    degree.set(r.fromTable, (degree.get(r.fromTable) ?? 0) + 1);
    degree.set(r.toTable, (degree.get(r.toTable) ?? 0) + 1);
  });
  const order = [...schema.tables].sort((a, b) => (degree.get(b.name) ?? 0) - (degree.get(a.name) ?? 0) || b.rowCount - a.rowCount);
  const placedBlock = new Map<string, Block>();
  const plots: Record<string, Plot> = {};

  for (const t of order) {
    const related = schema.relationships
      .filter((r) => r.fromTable === t.name || r.toTable === t.name)
      .map((r) => (r.fromTable === t.name ? r.toTable : r.fromTable))
      .map((n) => placedBlock.get(n))
      .filter((b): b is Block => !!b);
    const free = blocks.filter((b) => !used.has(key(b)));
    if (!free.length) break;
    free.sort((a, b) => {
      const ra = related.length ? related.reduce((s, r) => s + blockDist(a, r), 0) : 0;
      const rb = related.length ? related.reduce((s, r) => s + blockDist(b, r), 0) : 0;
      return ra - rb || centerDist(a) - centerDist(b);
    });
    const b = free[0];
    used.add(key(b));
    placedBlock.set(t.name, b);
    const tier = tierFor(t.rowCount);
    const spec = TIER_TYPE[style][tier];
    const px = b.x0 + (spec.size === 1 ? 2 : 1);
    const py = b.y0 + (spec.size === 1 ? 2 : 1);
    const plot: Plot = { table: t.name, x: px, y: py, w: spec.size, h: spec.size, type: spec.type, tier, entry: { x: b.x0 - 1, y: b.y0 + 2 } };
    plots[t.name] = plot;
    decorateCampus(grid, b.x0, b.y0, plot, rand, false, leafy);
  }

  for (const b of blocks) {
    if (used.has(key(b))) continue;
    if (style === 'town') decorateTown(grid, b.x0, b.y0, rand);
    else if (style === 'market') decorateMarket(grid, b.x0, b.y0, rand);
    else decorateOffice(grid, b.x0, b.y0, rand);
  }

  // Countryside between the city and the beach
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!near(x, y)) continue;
      const t = grid[y][x];
      if (t.building.type !== 'grass') continue;
      if (blocks.some((b) => x >= b.x0 && x < b.x0 + 5 && y >= b.y0 && y < b.y0 + 5)) continue;
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx]?.building.type === 'water');
      if (nearWater) continue;
      const r = rand();
      if (style === 'town') {
        if (r < 0.34) grid[y][x] = tile(x, y, 'tree');
        else if (r < 0.37) grid[y][x] = tile(x, y, 'park');
      } else if (style === 'market') {
        if (r < 0.22) grid[y][x] = tile(x, y, 'tree');
        else if (r < 0.26) grid[y][x] = tile(x, y, 'community_garden');
      } else if (r < 0.14) grid[y][x] = tile(x, y, 'tree');
      else if (r < 0.16) grid[y][x] = tile(x, y, 'tennis');
    }
  }

  const scenery: GridPoint[] = [];
  const isPlotTile = (x: number, y: number) => [hq, ...Object.values(plots)].some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!near(x, y)) continue;
      const ty = grid[y][x].building.type;
      if (!NON_BUILDINGS.has(ty) && !isPlotTile(x, y)) scenery.push({ x, y });
    }
  }

  return { id, center: { x: CX, y: CY }, size: N, hq, plots, road, scenery };
}

function placeFootprint(grid: Tile[][], x: number, y: number, w: number, h: number, type: BuildingType, extra: Partial<Building> = {}) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      grid[y + dy][x + dx] = tile(x + dx, y + dy, dx === 0 && dy === 0 ? type : 'empty', dx === 0 && dy === 0 ? extra : {});
    }
  }
}

/** Table and HQ blocks: the building sits on its own lot so it reads as a landmark. */
function decorateCampus(grid: Tile[][], x0: number, y0: number, plot: Plot, rand: () => number, isHq: boolean, leafy: boolean) {
  for (let y = y0; y < y0 + 5; y++) {
    for (let x = x0; x < x0 + 5; x++) {
      const inside = x >= plot.x && x < plot.x + plot.w && y >= plot.y && y < plot.y + plot.h;
      if (inside) continue;
      const edge = x === x0 || y === y0 || x === x0 + 4 || y === y0 + 4;
      if (isHq) grid[y][x] = tile(x, y, edge && rand() < 0.5 ? 'tree' : 'park');
      else if (leafy) grid[y][x] = tile(x, y, edge && rand() < 0.45 ? 'tree' : 'grass');
      else grid[y][x] = tile(x, y, edge && rand() < 0.25 ? 'tree' : 'grass');
    }
  }
}

/** Town: family houses around playgrounds, sports fields and parks. */
function decorateTown(grid: Tile[][], x0: number, y0: number, rand: () => number) {
  const style = rand();
  const taken = new Set<string>();
  if (style < 0.35) {
    const cx = x0 + 1 + Math.floor(rand() * 2);
    const cy = y0 + 1 + Math.floor(rand() * 2);
    const pick = rand();
    placeFootprint(grid, cx, cy, 2, 2, pick < 0.4 ? 'playground_large' : pick < 0.7 ? 'football_field' : 'apartment_low');
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) taken.add(`${cx + dx},${cy + dy}`);
  }
  for (let y = y0; y < y0 + 5; y++) {
    for (let x = x0; x < x0 + 5; x++) {
      if (taken.has(`${x},${y}`)) continue;
      const edge = x === x0 || y === y0 || x === x0 + 4 || y === y0 + 4;
      if (!edge) { grid[y][x] = tile(x, y, rand() < 0.55 ? 'tree' : 'park'); continue; }
      const corner = (x === x0 || x === x0 + 4) && (y === y0 || y === y0 + 4);
      grid[y][x] = tile(x, y, corner ? 'tree' : (x + y) % 2 ? 'house_small' : 'house_medium');
    }
  }
}

/** Market: small shops and eateries, with a few warehouses and kitchen gardens. */
function decorateMarket(grid: Tile[][], x0: number, y0: number, rand: () => number) {
  const taken = new Set<string>();
  if (rand() < 0.45) {
    const cx = x0 + (rand() < 0.5 ? 0 : 3);
    const cy = y0 + (rand() < 0.5 ? 0 : 3);
    placeFootprint(grid, cx, cy, 2, 2, rand() < 0.5 ? 'warehouse' : 'greenhouse_garden');
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) taken.add(`${cx + dx},${cy + dy}`);
  }
  const pool: BuildingType[] = ['shop_small', 'shop_medium', 'shop_small', 'house_small', 'shop_medium', 'tree'];
  for (let y = y0; y < y0 + 5; y++) {
    for (let x = x0; x < x0 + 5; x++) {
      if (taken.has(`${x},${y}`)) continue;
      const type = pool[Math.floor(rand() * pool.length)];
      grid[y][x] = tile(x, y, type, type === 'tree' ? {} : { flipped: rand() < 0.5 });
    }
  }
}

/** Downtown: a business district of office blocks and towers. */
function decorateOffice(grid: Tile[][], x0: number, y0: number, rand: () => number) {
  const taken = new Set<string>();
  const corners: [number, number][] = [[0, 0], [3, 0], [0, 3], [3, 3]];
  for (const [ox, oy] of corners) {
    if (rand() < 0.55) {
      const cx = x0 + ox;
      const cy = y0 + oy;
      placeFootprint(grid, cx, cy, 2, 2, rand() < 0.45 ? 'office_high' : 'office_low', { flipped: rand() < 0.5 });
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) taken.add(`${cx + dx},${cy + dy}`);
    }
  }
  const pool: BuildingType[] = ['office_building_small', 'shop_medium', 'office_building_small', 'tree', 'grass'];
  for (let y = y0; y < y0 + 5; y++) {
    for (let x = x0; x < x0 + 5; x++) {
      if (taken.has(`${x},${y}`)) continue;
      const type = pool[Math.floor(rand() * pool.length)];
      grid[y][x] = tile(x, y, type, type === 'tree' || type === 'grass' ? {} : { flipped: rand() < 0.5 });
    }
  }
}

/** Grid with table buildings hidden (fog of war) except the ones already discovered, per island. */
export function withFog(world: WorldLayout, discovered: Record<IslandId, Set<string>>): Tile[][] {
  const grid = world.grid.map((row) => row.map((t) => ({ ...t, building: { ...t.building } })));
  for (const isl of Object.values(world.islands)) {
    for (const plot of Object.values(isl.plots)) {
      const show = discovered[isl.id]?.has(plot.table) ?? false;
      for (let dy = 0; dy < plot.h; dy++) {
        for (let dx = 0; dx < plot.w; dx++) {
          const x = plot.x + dx;
          const y = plot.y + dy;
          grid[y][x] = tile(x, y, show ? (dx === 0 && dy === 0 ? plot.type : 'empty') : 'grass');
        }
      }
    }
  }
  return grid;
}

export function islandAt(world: WorldLayout, x: number, y: number): IslandId | null {
  for (const isl of Object.values(world.islands)) {
    if (Math.hypot(x - isl.center.x, y - isl.center.y) <= ISLAND_R + 2) return isl.id;
  }
  return null;
}

/** The table district a scenery building belongs to (nearest table building on its island). */
export function nearestTable(isl: IslandLayout, x: number, y: number): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const p of Object.values(isl.plots)) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p.table; }
  }
  return best;
}
