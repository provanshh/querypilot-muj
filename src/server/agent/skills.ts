import type { ChatMessage } from '@/server/agent/llm';
import type { ExecResult } from '@/server/agent/sqlTools';
import { getDataset } from '@/server/datasets/registry';
import { analyzeDataset, verifyCleaning } from '@/server/engine/analyze';
import { analystAnswer, columnFacts, engineerDraft, engineerPrompt, questionWithRules, schemaBrief, verifierReview } from '@/server/engine/agents';
import { basicChecks, execOn } from '@/server/engine/run';

/**
 * What each worker agent can do. The Mayor (master) sends a task `{ kind, input }` through the
 * queue; whichever worker serves that agent runs the skill and writes the JSON output back.
 */

export const WORKER_AGENTS = ['scout', 'inspector', 'engineer', 'verifier', 'analyst'] as const;
export type WorkerAgent = (typeof WORKER_AGENTS)[number];

async function load(datasetId: string) {
  const def = await getDataset(datasetId);
  if (!def) throw new Error(`Dataset ${datasetId} is not installed`);
  return { def, a: await analyzeDataset(def) };
}

type Link = { table: string; column: string };

export const SKILLS = {
  /** Catalog, column roles and the cleaning layer of a dataset. */
  'scout.map': async ({ datasetId }: { datasetId: string }) => (await load(datasetId)).a,

  /** Links the question to tables/columns from the catalog, comments and real values; returns the first SQL draft. */
  'scout.link': async ({ datasetId, question }: { datasetId: string; question: string }, signal: AbortSignal) => {
    const { def, a } = await load(datasetId);
    const brief = schemaBrief(a, def, await columnFacts(a));
    const history: ChatMessage[] = [engineerPrompt(brief), { role: 'user', content: questionWithRules(question, def.rules) }];
    const first = await engineerDraft(history, signal);
    return { ...first, brief, rules: def.rules, history };
  },

  /** Quality problems in the columns a question depends on (all columns when none are given). */
  'inspector.profile': async ({ datasetId, tables, columns }: { datasetId: string; tables: string[]; columns: Link[] }) => {
    const { a } = await load(datasetId);
    const relevant = (i: (typeof a.issues)[number]) => !tables.length || (tables.includes(i.table) && (
      i.kind === 'duplicates' || (!!i.column && columns.some((c) => c.table === i.table && c.column === i.column))
    ));
    return { issues: a.issues.filter((i) => i.severity !== 'info' && relevant(i)), score: a.score, grade: a.grade };
  },

  'engineer.draft': async ({ history }: { history: ChatMessage[] }, signal: AbortSignal) => {
    const out = await engineerDraft(history, signal);
    return { ...out, history };
  },

  'engineer.execute': ({ schema, sql, layer }: { schema: string; sql: string; layer?: string }) => execOn(schema, sql, layer),

  /** Runs the cleaning layer: row counts before and after. */
  'engineer.clean': async ({ datasetId }: { datasetId: string }) => {
    const { def, a } = await load(datasetId);
    const { rowsBefore, rowsAfter } = await verifyCleaning(def, a);
    return { rowsBefore, rowsAfter };
  },

  /** Re-profiles the cleaned layer with the same rules. */
  'verifier.reprofile': async ({ datasetId }: { datasetId: string }) => {
    const { def, a } = await load(datasetId);
    const { afterIssues, afterScore, afterGrade, duplicatesLeft } = await verifyCleaning(def, a);
    return { afterIssues, afterScore, afterGrade, duplicatesLeft };
  },

  'verifier.checks': async ({ datasetId, sql, result }: { datasetId: string; sql: string; result: ExecResult }) =>
    basicChecks((await load(datasetId)).a, sql, result),

  'verifier.review': ({ brief, question, sql, result, rules = [] }: { brief: string; question: string; sql: string; result: ExecResult; rules?: string[] }, signal: AbortSignal) =>
    verifierReview(brief, question, sql, result, rules, signal),

  'analyst.answer': ({ question, result, caveats }: { question: string; result: ExecResult; caveats: string[] }, signal: AbortSignal) =>
    analystAnswer(question, result, caveats, signal),
};

export type SkillName = keyof typeof SKILLS;
export type SkillInput<K extends SkillName> = Parameters<(typeof SKILLS)[K]>[0];
export type SkillOutput<K extends SkillName> = Awaited<ReturnType<(typeof SKILLS)[K]>>;
