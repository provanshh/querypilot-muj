import type { IslandId } from './types';

interface IslandMeta {
  name: string;
  /** Short HUD label. */
  short: string;
  color: string;
}

const PALETTE = ['#38bdf8', '#fb923c', '#a78bfa'];
const UNKNOWN: IslandMeta = { name: 'Removed dataset', short: 'Removed', color: '#94a3b8' };

let ids: IslandId[] = [];
let meta: Record<IslandId, IslandMeta> = {};

/** Called whenever the game world loads: each uploaded dataset on the map becomes an island. */
export function registerIslands(list: { id: IslandId; name: string }[]) {
  ids = list.map((d) => d.id);
  meta = Object.fromEntries(list.map((d, i) => [d.id, {
    name: d.name,
    short: d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name,
    color: PALETTE[i % PALETTE.length],
  }]));
}

export const islandIds = (): IslandId[] => ids;

export const islandMeta = (id: IslandId | null | undefined): IslandMeta => (id && meta[id]) || UNKNOWN;

export const isIsland = (id: string | null | undefined): id is IslandId => !!id && id in meta;

export const nextIsland = (id: IslandId): IslandId => ids.length ? ids[(ids.indexOf(id) + 1) % ids.length] : id;
