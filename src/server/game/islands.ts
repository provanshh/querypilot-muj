import type { WorldSchema } from '@/lib/quest/types';
import { MAX_ISLANDS } from '@/lib/quest/island';
import { introspect } from '@/server/agent/sqlTools';
import { getDataset, listDatasets } from '@/server/datasets/registry';
import { safeSummary } from '@/server/engine/summary';

/** The game world: the most recently uploaded datasets, one island each. */
interface GameIsland { id: string; name: string; schema: WorldSchema; questions: { id: string; question: string }[] }

export async function gameWorld(): Promise<{ islands: GameIsland[] }> {
  const defs = (await listDatasets()).slice(0, MAX_ISLANDS);
  const islands = await Promise.all(defs.map(async (def): Promise<GameIsland> => ({
    id: def.id,
    name: def.name,
    schema: await introspect({ id: def.id, schema: def.messySchema, name: def.name, rules: def.rules, tables: def.tables }, 0),
    questions: (await safeSummary(def)).questions,
  })));
  return { islands };
}

export const gameDataset = getDataset;
