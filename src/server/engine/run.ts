import type {
  AgentId, ApprovalMode, AuditIssue, CheckResult, CrewReportEntry, QueryAttempt, QuestEvent, QuestEventType, Verdict,
} from '@/lib/quest/types';
import { withReadOnly } from '@/server/db/pg';
import { checkSqlSafety, MAX_RESULT_ROWS, type ExecResult } from '@/server/agent/sqlTools';
import { getLlmStatus, LlmUnavailableError, type ChatMessage } from '@/server/agent/llm';
import type { ApprovalDecision, RunHandle } from '@/server/agent/runs';
import { dispatch, onlineAgents } from '@/server/agent/master';
import type { SkillInput, SkillName, SkillOutput } from '@/server/agent/skills';
import type { DatasetDef } from '@/server/datasets/registry';
import { withLayer, type Analysis, type Issue } from './analyze';
import { referenced, type Draft, type Review } from './agents';
import { qi } from './catalog';

type Emit = (e: QuestEvent) => void;

interface DatasetMissionOptions {
  def: DatasetDef;
  mode: 'ask' | 'audit';
  question: string;
  pace: 'cinematic' | 'fast';
  /** 'ask': every SQL draft waits for a permit from the user before it runs. */
  approval: ApprovalMode;
}

/* ------------------------------ execution ------------------------------ */

function cell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

/** Read-only execution of agent SQL, optionally on top of the generated cleaning layer. */
export async function execOn(schema: string, sql: string, layer?: string, timeoutMs = 6000): Promise<ExecResult> {
  const safety = checkSqlSafety(sql);
  if (!safety.ok) throw new Error(safety.reason);
  const full = layer ? withLayer(layer, safety.cleaned) : safety.cleaned;
  return withReadOnly(schema, async (q) => {
    const start = performance.now();
    const { columns, rows } = await q.arrays(`SELECT * FROM (\n${full}\n) AS _q LIMIT ${MAX_RESULT_ROWS + 1}`);
    return {
      columns,
      rows: rows.slice(0, MAX_RESULT_ROWS).map((r) => r.map(cell)),
      rowCount: Math.min(rows.length, MAX_RESULT_ROWS),
      truncated: rows.length > MAX_RESULT_ROWS,
      durationMs: Math.round((performance.now() - start) * 10) / 10,
    };
  }, timeoutMs);
}

/* ------------------------------ mission ------------------------------ */

const CREW: AgentId[] = ['mayor', 'scout', 'inspector', 'engineer', 'verifier', 'analyst'];
const MAX_FIXES = 2;
const PERMIT_WAIT_MS = 5 * 60_000;

/**
 * The Mayor: plans the run, dispatches each step to a worker agent through the task queue, reads
 * the results back and decides what happens next. It owns the event log, so every UI sees one
 * ordered story no matter which worker process did the work.
 */
export async function runDatasetMission(run: RunHandle, opts: DatasetMissionOptions, send: Emit): Promise<Verdict> {
  const startedAt = Date.now();
  const attempts: QueryAttempt[] = [];
  const signal = run.abort.signal;
  const { def } = opts;
  const log: QuestEvent[] = [];
  let seq = 0;
  const workers = new Map<string, string>();
  const emit = (type: QuestEventType, agent: AgentId | undefined, summary: string, extra: Partial<QuestEvent> = {}) => {
    if (signal.aborted) throw new Error('aborted');
    if (type === 'agent.task_succeeded' && agent && workers.has(agent)) extra = { ...extra, metadata: { ...extra.metadata, worker: workers.get(agent) } };
    seq += 1;
    const e: QuestEvent = { run_id: run.id, event_id: `${run.id}:${seq}`, seq, timestamp: new Date().toISOString(), type, agent_id: agent, summary, ...extra };
    log.push(e);
    send(e);
  };
  const pace = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, opts.pace === 'fast' ? Math.min(ms, 60) : ms);
      signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
    });

  let engine: Verdict['engine'] = { mode: 'profiler' };
  if (opts.mode === 'ask') {
    const llm = await getLlmStatus();
    if (!llm.available) throw new LlmUnavailableError(`The agents are unavailable: ${llm.reason ?? 'unknown reason'}`);
    engine = { mode: 'llm' };
  }
  const call = async <K extends SkillName>(kind: K, input: SkillInput<K>): Promise<SkillOutput<K>> => {
    const r = await dispatch(run.id, kind, input, signal);
    if (r.workerId) workers.set(kind.split('.')[0], r.workerId);
    return r.output;
  };

  emit('run.started', 'mayor', opts.mode === 'audit' ? `Audit requested for ${def.name}: is this data clear enough to analyse?` : `Question for ${def.name}: "${opts.question}"`, {
    metadata: { question: opts.question, engine, dataset: def.id, datasetName: def.name, mode: opts.mode },
  });
  await pace(400);
  const tasks = opts.mode === 'audit'
    ? [
      { id: 't1', agent: 'scout', title: 'Map tables and keys', deps: [] },
      { id: 't2', agent: 'inspector', title: 'Profile every column', deps: ['t1'] },
      { id: 't3', agent: 'engineer', title: 'Build the cleaning layer', deps: ['t2'] },
      { id: 't4', agent: 'verifier', title: 'Re-profile and cross-check', deps: ['t3'] },
      { id: 't5', agent: 'analyst', title: 'Before / after report', deps: ['t4'] },
    ]
    : [
      { id: 't1', agent: 'scout', title: 'Link the question to tables and columns', deps: [] },
      { id: 't2', agent: 'inspector', title: 'Check those columns for problems', deps: ['t1'] },
      { id: 't3', agent: 'engineer', title: 'Write and run read-only SQL', deps: ['t1'] },
      { id: 't4', agent: 'verifier', title: 'Challenge the result', deps: ['t2', 't3'] },
      { id: 't5', agent: 'analyst', title: 'Answer with evidence, or decline', deps: ['t4'] },
    ];
  emit('plan.created', 'mayor', opts.mode === 'audit'
    ? 'Plan: map the schema, profile every column, build a cleaning layer, re-check it, then report before vs after.'
    : 'Plan: map the schema, link the question to it, inspect the columns involved, draft SQL, have it reviewed, then answer or decline.', { metadata: { tasks, dataset: def.id } });
  const online = await onlineAgents();
  emit('agent.say', 'mayor', `Dispatching through the task queue: ${online.length ? `${online.length} worker${online.length === 1 ? '' : 's'} online (${[...new Set(online.map((w) => w.agent))].join(', ')})` : 'waiting for workers to come online'}.`, {
    metadata: { workers: online },
  });
  await pace(500);

  /* ---------------- Scout: catalog ---------------- */
  emit('agent.task_started', 'scout', `Reading the table catalog of ${def.name}.`, { task_id: 't1' });
  const a: Analysis = await call('scout.map', { datasetId: def.id });
  for (const t of a.tables) {
    emit('schema.table_discovered', 'scout', `${t.name}: ${t.rows.toLocaleString()} rows, ${t.columns.length} columns${t.desc ? ` (${t.desc})` : ''}.`, {
      task_id: 't1', table_ids: [t.name],
      metadata: { table: t.name, rows: t.rows, columns: t.columns.map((c) => ({ name: c.name, role: c.role, type: c.pgType })) },
    });
    await pace(160);
  }
  for (const r of a.catalog.relationships) {
    emit('schema.relationship_discovered', 'scout', `${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`, { task_id: 't1', table_ids: [r.fromTable, r.toTable] });
    await pace(90);
  }

  if (opts.mode === 'audit') return audit();

  /* ---------------- Scout: schema linking (LLM) ---------------- */
  emit('agent.say', 'scout', `Linking the question to ${a.tables.length} tables, their comments and real values.`, { task_id: 't1' });
  let first: SkillOutput<'scout.link'>;
  try {
    first = await call('scout.link', { datasetId: def.id, question: opts.question });
  } catch (err) {
    emit('agent.task_failed', 'scout', `Could not link the question: ${errText(err)}`, { task_id: 't1' });
    throw err;
  }
  const brief = first.brief;
  const rules = first.rules;
  let history: ChatMessage[] = first.history;
  let draft: Draft = first.draft;
  const linked = linkOf(draft);
  if (linked.tables.length) {
    emit('schema.relevance', 'scout', `Relevant: ${(linked.columns.length ? linked.columns.map((c) => `${c.table}.${c.column}`) : linked.tables).join(', ')}.`, {
      task_id: 't1', table_ids: linked.tables, metadata: { tables: linked.tables, columns: linked.columns, ms: first.ms },
    });
  }
  const documented = Object.entries(def.tables).flatMap(([t, m]) => Object.entries(m.columns)
    .filter(([c, cm]) => cm.desc || cm.synonyms?.length || def.valueLabels?.[`${t}.${c}`]).map(([c]) => `${t}.${c}`));
  emit('agent.say', 'scout', documented.length || def.rules.length
    ? `Owner knowledge in use: ${def.rules.length} business rule${def.rules.length === 1 ? '' : 's'}, ${documented.length} documented column${documented.length === 1 ? '' : 's'}.${draft.assumptions.some((x) => /^R\d+/.test(x)) ? ` Applied ${draft.assumptions.filter((x) => /^R\d+/.test(x)).map((x) => x.split(':')[0]).join(', ')}.` : ''}`
    : 'No data dictionary or business rules for this dataset; meanings are inferred from column names and real values.', {
    task_id: 't1', metadata: { rules: def.rules, documented },
  });
  emit('agent.task_succeeded', 'scout', `Mapped ${a.tables.length} tables and ${a.catalog.relationships.length} links${linked.tables.length ? `; the question needs ${linked.tables.join(' + ')}` : ''}.`, { task_id: 't1' });
  await pace(300);

  /* ---------------- Inspector ---------------- */
  emit('agent.task_started', 'inspector', linked.tables.length ? 'Profiling the columns this question depends on.' : 'Profiling the dataset.', { task_id: 't2' });
  const { issues } = await call('inspector.profile', { datasetId: def.id, tables: linked.tables, columns: linked.columns });
  for (const i of issues.slice(0, 10)) {
    emit('data.issue_found', 'inspector', i.title, { task_id: 't2', table_ids: [i.table], metadata: { issue: i } });
    await pace(170);
  }
  if (!issues.length) emit('data.profile_clean', 'inspector', 'No quality problems in the columns this question uses.', { task_id: 't2' });
  emit('agent.task_succeeded', 'inspector', `${issues.length} problem${issues.length === 1 ? '' : 's'} in the columns involved. Dataset clarity ${a.score}/100 (${a.grade}).`, { task_id: 't2', metadata: { score: a.score, grade: a.grade } });
  await pace(300);

  /* ---------------- Engineer ---------------- */
  emit('agent.task_started', 'engineer', 'Drafting SQL.', { task_id: 't3' });
  if (!draft.answerable) {
    emit('agent.say', 'engineer', `No faithful query: ${draft.reason}`, { task_id: 't3' });
    emit('agent.task_succeeded', 'engineer', 'Declined to write SQL for a question the data cannot answer.', { task_id: 't3' });
    return abstain(draft.reason!);
  }
  if (draft.assumptions.length) emit('agent.say', 'engineer', `Assumptions: ${draft.assumptions.join('; ')}.`, { task_id: 't3' });

  const dirty = issues.filter((i) => i.severity === 'high' || i.severity === 'medium');
  if (dirty.length) {
    const sql1 = draft.sql!;
    emit('query.generated', 'engineer', 'Draft 1: run the query straight on the raw tables.', { task_id: 't3', metadata: { sql: sql1, attempt: 1, layer: false } });
    await pace(350);
    emit('query.execution_started', 'engineer', 'Executing draft 1 (read-only transaction).', { task_id: 't3' });
    const att: QueryAttempt = { attempt: 1, sql: sql1, failedChecks: [] };
    attempts.push(att);
    if (!(await permit(sql1, 1))) return abstain('You denied the permit, so the query was never run.');
    emit('agent.task_started', 'verifier', 'Checking draft 1 against the Inspector\'s findings.', { task_id: 't4' });
    try {
      const raw = await call('engineer.execute', { schema: a.schema, sql: sql1 });
      att.rowCount = raw.rowCount;
      att.durationMs = raw.durationMs;
      emit('query.execution_succeeded', 'engineer', `Draft 1 returned ${raw.rowCount} row${raw.rowCount === 1 ? '' : 's'}, but from uncleaned data.`, { task_id: 't3', metadata: { attempt: 1, columns: raw.columns, rows: raw.rows.slice(0, 8), rowCount: raw.rowCount } });
      await pace(300);
      att.failedChecks.push('clean_inputs');
      emit('validation.check_failed', 'verifier', `Rejected: draft 1 read raw columns with ${dirty.length} known problem${dirty.length === 1 ? '' : 's'} (${dirty.slice(0, 3).map((i) => i.kind.replace(/_/g, ' ')).join(', ')}). Its numbers can't be trusted.`, {
        task_id: 't4', metadata: { check: 'clean_inputs', attempt: 1, issues: dirty.map((i) => i.id) },
      });
    } catch (err) {
      const msg = errText(err);
      att.error = msg;
      att.failedChecks.push('executes');
      emit('query.execution_failed', 'engineer', `Draft 1 crashed: ${msg}`, { task_id: 't3', metadata: { attempt: 1, error: msg } });
      await pace(300);
      emit('validation.check_failed', 'verifier', `Rejected: ${explainError(msg, dirty)}`, { task_id: 't4', metadata: { check: 'executes', attempt: 1 } });
    }
    await pace(300);
    emit('repair.requested', 'verifier', `Repair: run on the cleaning layer (${dirty.slice(0, 4).map((i) => i.fix.toLowerCase()).join('; ')}).`, { task_id: 't4' });
    await pace(350);
  }

  let ran = await execute(dirty.length ? 'same query, on top of the cleaning layer' : 'run on the cleaning layer');
  if ('reason' in ran) return abstain(ran.reason);
  emit('agent.task_succeeded', 'engineer', 'Query ran on cleaned data.', { task_id: 't3' });
  await pace(250);

  /* ---------------- Verifier ---------------- */
  if (!dirty.length) emit('agent.task_started', 'verifier', 'Challenging the result.', { task_id: 't4' });
  let checks = await call('verifier.checks', { datasetId: def.id, sql: ran.sql, result: ran.result });
  for (const c of checks) {
    emit(c.status === 'pass' ? 'validation.check_passed' : c.status === 'fail' ? 'validation.check_failed' : 'validation.check_warned', 'verifier', `${c.label}: ${c.detail}`, { task_id: 't4', metadata: { check: c.id } });
    await pace(200);
  }

  let review = await reviewOnce(ran.sql, ran.result);
  if (review && review.verdict !== 'ok') {
    emit('repair.requested', 'verifier', `Sent back to the Engineer: ${review.problem ?? review.verdict}`, { task_id: 't4' });
    attempts.at(-1)?.failedChecks.push('review');
    history.push({ role: 'user', content: `The Verifier rejected that query: ${review.problem ?? 'it does not answer the question'}. Return a corrected JSON reply, or {"answerable": false, ...} if the data cannot answer the question.` });
    const fixed = await call('engineer.draft', { history });
    history = fixed.history;
    draft = fixed.draft;
    if (!draft.answerable) {
      emit('agent.say', 'engineer', `Agreed, no faithful query: ${draft.reason}`, { task_id: 't3' });
      return abstain(draft.reason!);
    }
    const prevVerdict = review.verdict;
    ran = await execute('repaired after review');
    if ('reason' in ran) return abstain(ran.reason);
    checks = await call('verifier.checks', { datasetId: def.id, sql: ran.sql, result: ran.result });
    review = await reviewOnce(ran.sql, ran.result);
    if (review?.verdict === 'unanswerable' && prevVerdict === 'unanswerable') {
      return abstain(`The Verifier twice found the data cannot answer this: ${review.problem ?? ''}`.trim());
    }
  }
  const reviewCheck: CheckResult = !review
    ? { id: 'review', label: 'Verifier review', status: 'warn', detail: 'No independent review was available; only the deterministic checks ran' }
    : review.verdict === 'ok'
      ? { id: 'review', label: 'Verifier review', status: 'pass', detail: 'An independent review confirmed the SQL answers exactly what was asked' }
      : { id: 'review', label: 'Verifier review', status: 'warn', detail: `Still disputed after one repair: ${review.problem ?? review.verdict}` };
  checks = [...checks.filter((c) => c.id !== 'review'), reviewCheck];
  emit(reviewCheck.status === 'pass' ? 'validation.check_passed' : 'validation.check_warned', 'verifier', `${reviewCheck.label}: ${reviewCheck.detail}`, { task_id: 't4', metadata: { check: 'review' } });
  if (rules.length) {
    const broken = review?.rulesViolated ?? [];
    const applied = review?.rulesApplied ?? [];
    const rulesCheck: CheckResult = !review
      ? { id: 'rules', label: 'Business rules', status: 'warn', detail: `${rules.length} owner rule${rules.length === 1 ? '' : 's'} could not be independently checked` }
      : broken.length
        ? { id: 'rules', label: 'Business rules', status: 'fail', detail: broken.map((b) => `breaks R${b.rule} "${rules[b.rule - 1]}"${b.why ? ` (${b.why})` : ''}`).join('; ') }
        : { id: 'rules', label: 'Business rules', status: 'pass', detail: applied.length ? `Applied ${applied.map((n) => `R${n} "${rules[n - 1]}"`).join('; ')}` : `None of the ${rules.length} owner rule${rules.length === 1 ? '' : 's'} applies to this question` };
    checks.push(rulesCheck);
    emit(rulesCheck.status === 'pass' ? 'validation.check_passed' : rulesCheck.status === 'fail' ? 'validation.check_failed' : 'validation.check_warned', 'verifier', `${rulesCheck.label}: ${rulesCheck.detail}`, {
      task_id: 't4', metadata: { check: 'rules', applied, violated: broken },
    });
  }

  const failed = checks.filter((c) => c.status === 'fail');
  if (failed.length) {
    emit('agent.task_failed', 'verifier', `Result failed ${failed.map((c) => c.label).join(', ')}.`, { task_id: 't4' });
    attempts.at(-1)?.failedChecks.push(...failed.map((c) => c.id));
    return abstain(`The result failed verification (${failed.map((c) => c.detail).join('; ')}). An unverified number would be worse than no answer.`);
  }
  emit('agent.task_succeeded', 'verifier', `Approved: ${checks.filter((c) => c.status === 'pass').length} checks passed${checks.some((c) => c.status === 'warn') ? `, ${checks.filter((c) => c.status === 'warn').length} caveat(s)` : ''}.`, { task_id: 't4' });
  await pace(250);

  /* ---------------- Analyst ---------------- */
  const result = ran.result;
  emit('agent.task_started', 'analyst', 'Writing the answer from verified rows only.', { task_id: 't5' });
  const caveats = checks.filter((c) => c.status === 'warn').map((c) => c.detail);
  if (result.truncated) caveats.push(`Result truncated at ${MAX_RESULT_ROWS} rows.`);
  let answer: string;
  try {
    const out = await call('analyst.answer', { question: opts.question, result, caveats });
    answer = out.answer;
  } catch (err) {
    if (signal.aborted) throw err;
    caveats.push(`The Analyst was unavailable (${errText(err)}), so the verified rows are shown as-is.`);
    answer = result.rowCount ? `${result.rowCount} verified row${result.rowCount === 1 ? '' : 's'}; see the table.` : 'No rows matched the question.';
  }
  const verdict: Verdict = {
    status: 'answered', question: opts.question, answer, columns: result.columns, rows: result.rows, rowCount: result.rowCount,
    sql: ran.sql, attempts, checks, caveats, assumptions: draft.assumptions,
    trust: trust(checks, true), chart: chartOf(result), engine, elapsedMs: 0, dataset: def.id, mode: 'ask',
    plan: draft.tables.length ? `Uses ${draft.tables.join(', ')}` : undefined,
  };
  emit('answer.approved', 'analyst', answer, { task_id: 't5', table_ids: referenced(a, ran.sql).tables });
  return seal(verdict, 'Answer delivered.');

  /* ---------------- helpers ---------------- */
  function linkOf(d: Draft) {
    const known = (t: string) => a.tables.some((x) => x.name === t);
    const fromSql = d.sql ? referenced(a, d.sql) : { tables: [], columns: [] };
    const claimed = d.columns.map((s) => s.split('.')).filter(([t, c]) => c && a.tables.find((x) => x.name === t)?.columns.some((y) => y.name === c)).map(([table, column]) => ({ table, column }));
    const columns = [...claimed, ...fromSql.columns.map(({ table, column }) => ({ table, column }))].filter((c, i, arr) => arr.findIndex((x) => x.table === c.table && x.column === c.column) === i);
    const tables = [...new Set([...d.tables.filter(known), ...fromSql.tables])];
    return { tables, columns };
  }

  /** Runs the current draft on the cleaning layer; on a database error the Engineer gets the error and tries again. */
  async function execute(label: string): Promise<{ sql: string; result: ExecResult } | { reason: string }> {
    for (let fix = 0; ; fix += 1) {
      const sql = draft.sql!;
      const n = attempts.length + 1;
      emit('query.generated', 'engineer', `Draft ${n}: ${label}.`, { task_id: 't3', metadata: { sql, attempt: n, layer: true, layerSql: a.layer } });
      await pace(300);
      emit('query.execution_started', 'engineer', `Executing draft ${n}.`, { task_id: 't3' });
      const att: QueryAttempt = { attempt: n, sql, failedChecks: [] };
      attempts.push(att);
      if (!(await permit(sql, n))) return { reason: 'You denied the permit, so the query was never run.' };
      try {
        const result = await call('engineer.execute', { schema: a.schema, sql, layer: a.layer });
        att.rowCount = result.rowCount;
        att.durationMs = result.durationMs;
        emit('query.execution_succeeded', 'engineer', `Draft ${n} returned ${result.rowCount} row${result.rowCount === 1 ? '' : 's'} in ${result.durationMs} ms.`, { task_id: 't3', metadata: { attempt: n, columns: result.columns, rows: result.rows.slice(0, 8), rowCount: result.rowCount } });
        return { sql, result };
      } catch (err) {
        const msg = errText(err);
        att.error = msg;
        att.failedChecks.push('executes');
        emit('query.execution_failed', 'engineer', `Draft ${n} failed: ${msg}`, { task_id: 't3', metadata: { attempt: n, error: msg } });
        if (fix >= MAX_FIXES) {
          emit('agent.task_failed', 'engineer', 'Could not produce a working query.', { task_id: 't3' });
          return { reason: `The query kept failing on the cleaned data (${msg}). Returning a guess would be worse than no answer.` };
        }
        history.push({ role: 'user', content: `That query failed in PostgreSQL: ${msg}. Return a corrected JSON reply.` });
        const next = await call('engineer.draft', { history });
        history = next.history;
        draft = next.draft;
        if (!draft.answerable) {
          emit('agent.say', 'engineer', `Gave up on SQL: ${draft.reason}`, { task_id: 't3' });
          return { reason: draft.reason! };
        }
        label = 'fixed after the database error';
      }
    }
  }

  /** null when no review was possible; the result then carries a caveat instead of a pass. */
  async function reviewOnce(sql: string, result: ExecResult): Promise<Review | null> {
    emit('agent.say', 'verifier', 'Asking for an independent review: does this SQL answer exactly what was asked?', { task_id: 't4' });
    try {
      const out = await call('verifier.review', { brief, question: opts.question, sql, result, rules });
      if (out.review.verdict !== 'ok') emit('validation.check_failed', 'verifier', `Review: ${out.review.problem ?? out.review.verdict}`, { task_id: 't4', metadata: { check: 'review', verdict: out.review.verdict } });
      return out.review;
    } catch (err) {
      if (signal.aborted) throw err;
      return null;
    }
  }

  /** With approval 'ask', the SQL waits here until the user stamps or denies it. */
  async function permit(sql: string, attempt: number): Promise<boolean> {
    if (opts.approval !== 'ask') return true;
    emit('approval.requested', 'engineer', `Draft ${attempt} needs a permit before it runs.`, {
      task_id: 't3', table_ids: referenced(a, sql).tables, metadata: { sql, attempt },
    });
    const decision = await new Promise<ApprovalDecision>((resolve, reject) => {
      const done = (fn: () => void) => { clearTimeout(timer); run.pendingApproval = null; signal.removeEventListener('abort', onAbort); fn(); };
      const onAbort = () => done(() => reject(new Error('aborted')));
      const timer = setTimeout(() => done(() => resolve('deny')), PERMIT_WAIT_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      run.pendingApproval = (d) => done(() => resolve(d));
    });
    emit('approval.resolved', 'mayor', decision === 'approve' ? `Permit stamped: draft ${attempt} may run.` : `Permit denied: draft ${attempt} will not run.`, {
      task_id: 't3', metadata: { decision, attempt },
    });
    return decision === 'approve';
  }

  async function abstain(reason: string): Promise<Verdict> {
    if (!log.some((e) => e.agent_id === 'verifier')) {
      emit('agent.task_started', 'verifier', 'Checking whether any faithful query exists.', { task_id: 't4' });
      await pace(250);
      emit('validation.check_failed', 'verifier', `Not answerable: ${reason}`, { task_id: 't4', metadata: { check: 'answerable' } });
    }
    emit('agent.task_started', 'analyst', 'Reviewing whether the evidence supports any answer.', { task_id: 't5' });
    await pace(300);
    const verdict: Verdict = {
      status: 'abstained', question: opts.question, answer: 'No answer: the data cannot support one.', reason,
      columns: [], rows: [], rowCount: 0, sql: attempts.at(-1)?.sql, attempts, checks: [], caveats: [], assumptions: [],
      trust: trust([], false), engine, elapsedMs: 0, dataset: def.id, mode: 'ask',
    };
    emit('answer.abstained', 'analyst', reason, { task_id: 't5' });
    return seal(verdict, 'Closed without an answer.');
  }

  async function audit(): Promise<Verdict> {
    emit('agent.task_succeeded', 'scout', `Mapped ${a.tables.length} tables, ${a.tables.reduce((s, t) => s + t.columns.length, 0)} columns, ${a.catalog.relationships.length} links.`, { task_id: 't1' });
    await pace(250);
    emit('agent.task_started', 'inspector', `Profiling ${a.rowsScanned.toLocaleString()} rows column by column.`, { task_id: 't2' });
    const { issues: real } = await call('inspector.profile', { datasetId: def.id, tables: [], columns: [] });
    for (const t of a.tables) {
      const tIssues = real.filter((i) => i.table === t.name);
      emit('agent.say', 'inspector', `${t.name}: ${t.columns.map((c) => `${c.name} (${c.role})`).join(', ')}.`, { task_id: 't2', table_ids: [t.name] });
      await pace(200);
      for (const i of tIssues) {
        emit('data.issue_found', 'inspector', i.title, { task_id: 't2', table_ids: [t.name], metadata: { issue: i } });
        await pace(140);
      }
      if (!tIssues.length) emit('data.profile_clean', 'inspector', `${t.name} looks clean.`, { task_id: 't2', table_ids: [t.name] });
    }
    emit('agent.task_succeeded', 'inspector', `${real.length} problems found. Clarity ${a.score}/100: ${a.grade}.`, { task_id: 't2', metadata: { score: a.score, grade: a.grade } });
    await pace(300);

    emit('agent.task_started', 'engineer', 'Building a cleaning layer: one cleaned view per table, original data untouched.', { task_id: 't3' });
    const fixes: NonNullable<Verdict['audit']>['fixes'] = [];
    for (const t of a.tables) {
      const changed = t.columns.filter((c) => c.transform);
      changed.forEach((c) => fixes.push({ table: t.name, column: c.name, role: c.role, transform: c.transform }));
      if (!changed.length && !t.dedupe) continue;
      emit('query.generated', 'engineer', `${t.name}: ${[...changed.map((c) => `${c.name} (${c.transform})`), t.dedupe ? `drop ${t.dedupe.removed} duplicate rows` : ''].filter(Boolean).join('; ')}.`, {
        task_id: 't3', table_ids: [t.name], metadata: { table: t.name, sql: `${t.name} AS (\n  ${t.cleanSelect}\n)` },
      });
      await pace(220);
    }
    emit('query.execution_started', 'engineer', 'Running the cleaning layer (read-only).', { task_id: 't3' });
    const v = await call('engineer.clean', { datasetId: def.id });
    for (const t of a.tables) {
      emit('query.execution_succeeded', 'engineer', `${t.name}: ${v.rowsBefore[t.name].toLocaleString()} → ${v.rowsAfter[t.name].toLocaleString()} rows.`, { task_id: 't3', table_ids: [t.name], metadata: { table: t.name } });
      await pace(120);
    }
    emit('agent.task_succeeded', 'engineer', `Cleaning layer ready: ${fixes.length} column fixes, ${a.tables.filter((t) => t.dedupe).length} dedupe rules.`, { task_id: 't3' });
    await pace(250);

    emit('agent.task_started', 'verifier', 'Re-profiling the cleaned data with the same rules.', { task_id: 't4' });
    const vr = await call('verifier.reprofile', { datasetId: def.id });
    const auditChecks: CheckResult[] = [];
    const remaining = vr.afterIssues.filter((i) => i.severity !== 'info');
    auditChecks.push({ id: 'reprofile', label: 'Re-profile', status: remaining.length ? 'warn' : 'pass', detail: remaining.length ? `${remaining.length} problem(s) remain: ${remaining.slice(0, 3).map((i) => i.title).join('; ')}` : 'No problems remain in the cleaned data' });
    auditChecks.push({ id: 'dupes', label: 'Duplicates', status: vr.duplicatesLeft ? 'fail' : 'pass', detail: vr.duplicatesLeft ? `${vr.duplicatesLeft} duplicate rows remain` : `${a.tables.reduce((s, t) => s + (t.dedupe?.removed ?? 0), 0)} duplicate rows removed, none left` });
    for (const c of auditChecks) {
      emit(c.status === 'pass' ? 'validation.check_passed' : c.status === 'fail' ? 'validation.check_failed' : 'validation.check_warned', 'verifier', `${c.label}: ${c.detail}`, { task_id: 't4', metadata: { check: c.id } });
      await pace(250);
    }
    emit('agent.task_succeeded', 'verifier', `Clarity after cleaning: ${vr.afterScore}/100 (${vr.afterGrade}).`, { task_id: 't4' });
    await pace(250);

    emit('agent.task_started', 'analyst', 'Writing the before / after report.', { task_id: 't5' });
    await pace(300);
    const removed = a.tables.reduce((s, t) => s + (t.dedupe?.removed ?? 0), 0);
    const toIssue = (i: Issue): AuditIssue => ({ id: i.id, table: i.table, column: i.column, kind: i.kind, severity: i.severity, count: i.count, title: i.title, examples: i.examples, fix: i.fix });
    const answer = `Clarity ${a.score} → ${vr.afterScore}/100 (${a.grade} → ${vr.afterGrade}). Fixed ${real.length} problems across ${new Set(fixes.map((f) => `${f.table}.${f.column}`)).size} columns${removed ? ` and removed ${removed} duplicate rows` : ''}. The original tables are untouched; agents query the cleaned layer.`;
    const verdict: Verdict = {
      status: 'answered', question: opts.question, answer,
      columns: ['table', 'rows before', 'rows after', 'problems', 'fixes'],
      rows: a.tables.map((t) => [t.name, v.rowsBefore[t.name], v.rowsAfter[t.name], a.issues.filter((i) => i.table === t.name && i.severity !== 'info').length, t.columns.filter((c) => c.transform).length + (t.dedupe ? 1 : 0)]),
      rowCount: a.tables.length, attempts: [], checks: auditChecks, caveats: vr.afterIssues.filter((i) => i.severity === 'info').map((i) => i.title), assumptions: [],
      trust: trust(auditChecks, true), engine, elapsedMs: 0, dataset: def.id, mode: 'audit',
      audit: {
        datasetId: def.id, scoreBefore: a.score, gradeBefore: a.grade, scoreAfter: vr.afterScore, gradeAfter: vr.afterGrade,
        issues: a.issues.map(toIssue), remaining: vr.afterIssues.map(toIssue), fixes, rowsBefore: v.rowsBefore, rowsAfter: v.rowsAfter, duplicatesRemoved: removed,
      },
    };
    emit('answer.approved', 'analyst', answer, { task_id: 't5' });
    return seal(verdict, 'Audit complete.');
  }

  function seal(verdict: Verdict, closing: string): Verdict {
    verdict.elapsedMs = Date.now() - startedAt;
    verdict.engine = engine;
    verdict.crew = crewReport(log, attempts);
    emit('run.finished', 'mayor', closing, { metadata: { elapsedMs: verdict.elapsedMs, verdict } });
    return verdict;
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function explainError(msg: string, dirty: Issue[]) {
  const col = dirty.find((i) => i.column && msg.includes(i.column));
  if (/function (sum|avg)\(text\)|operator does not exist: text|invalid input syntax for type (numeric|integer|date)/.test(msg)) {
    const num = dirty.find((i) => ['number_format', 'numeric_text', 'placeholder', 'scale_mix'].includes(i.kind));
    return `the database refused the maths because ${col?.column ?? num?.column ?? 'a numeric column'} is stored as text with values like ${num?.examples.slice(0, 2).join(', ') || 'N/A'}.`;
  }
  if (/date|timestamp/.test(msg)) return `dates are stored as text in several formats, so the date filter fails (${msg}).`;
  return `the query failed on raw data (${msg}).`;
}

/** Deterministic checks on an executed result. */
export async function basicChecks(a: Analysis, sql: string, r: ExecResult): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const ref = referenced(a, sql);
  checks.push({ id: 'executes', label: 'Runs read-only', status: 'pass', detail: `Executed in a READ ONLY transaction in ${r.durationMs} ms` });
  checks.push(r.rowCount
    ? { id: 'non_empty', label: 'Has rows', status: 'pass', detail: `${r.rowCount} row${r.rowCount === 1 ? '' : 's'}` }
    : { id: 'non_empty', label: 'Has rows', status: 'warn', detail: 'No rows matched; the answer is "none"' });
  const fixedCols = ref.columns.filter((c) => a.issues.some((i) => i.kind !== 'duplicates' && i.severity !== 'info' && i.table === c.table && i.column === c.column));
  if (fixedCols.length) {
    checks.push({ id: 'clean_inputs', label: 'Clean inputs', status: 'pass', detail: `Read through the cleaning layer: ${fixedCols.slice(0, 4).map((c) => `${c.table}.${c.column} ${a.tables.find((t) => t.name === c.table)?.columns.find((x) => x.name === c.column)?.transform ?? 'cleaned'}`).join('; ')}` });
  }
  a.tables.filter((t) => t.dedupe && ref.tables.includes(t.name)).forEach((t) => checks.push({
    id: `dedupe_${t.name}`, label: 'Duplicates removed', status: 'pass',
    detail: `${t.dedupe!.removed} duplicate ${t.name} row${t.dedupe!.removed === 1 ? '' : 's'} excluded${t.dedupe!.preferred ? ` (kept ${t.dedupe!.sourceCol} = '${t.dedupe!.preferred}')` : ''}`,
  }));
  if (r.rowCount > 1 && r.columns.length > 1) {
    const keys = r.rows.map((x) => String(x[0]));
    const unique = new Set(keys).size === keys.length;
    checks.push({ id: 'grain', label: 'One row per group', status: unique ? 'pass' : 'warn', detail: unique ? `${keys.length} distinct groups, no group counted twice` : `${r.columns[0]} repeats across rows; read the rows as a breakdown, not one value per ${r.columns[0]}` });
  }
  const measures = ref.columns.filter((c) => c.role === 'measure');
  if (measures.length) {
    const sel = measures.map((m, i) => `SELECT ${i} AS k, COUNT(*) FILTER (WHERE ${qi(m.column)} IS NULL)::int AS missing, COUNT(*)::int AS n FROM ${qi(m.table)}`).join(' UNION ALL ');
    const rows = await withReadOnly(a.schema, (q) => q<{ k: number; missing: number; n: number }>(withLayer(a.layer, sel)));
    const gaps = rows.filter((x) => x.missing > 0);
    checks.push(gaps.length
      ? { id: 'missing', label: 'Missing values', status: 'warn', detail: gaps.map((x) => `${x.missing} of ${x.n} ${measures[x.k].table} rows have no ${measures[x.k].column} recorded; they are left out, not counted as 0`).join('; ') }
      : { id: 'missing', label: 'Missing values', status: 'pass', detail: `Every row has a value for ${measures.map((m) => m.column).join(', ')}` });
  }
  return checks;
}

function chartOf(r: ExecResult): Verdict['chart'] {
  if (!r.rowCount || r.rowCount > 40 || r.columns.length < 2) return undefined;
  const isNum = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v));
  let vi = -1;
  for (let i = r.columns.length - 1; i > 0; i -= 1) if (r.rows.every((row) => row[i] === null || isNum(row[i]))) { vi = i; break; }
  if (vi < 0) return undefined;
  return r.rows.slice(0, 12).map((row) => ({ label: String(row[0] ?? '(missing)'), value: Number(row[vi]) }));
}

function trust(checks: CheckResult[], executed: boolean): Verdict['trust'] {
  return {
    schemaMapped: true, executed,
    checksPassed: checks.filter((c) => c.status === 'pass').length,
    checksFailed: checks.filter((c) => c.status === 'fail').length,
    checksWarned: checks.filter((c) => c.status === 'warn').length,
    independentlyVerified: checks.some((c) => c.id === 'review' && c.status === 'pass'),
  };
}

function crewReport(log: QuestEvent[], attempts: QueryAttempt[]): CrewReportEntry[] {
  return CREW.map((agent) => {
    const mine = log.filter((e) => e.agent_id === agent);
    const count = (t: QuestEventType) => mine.filter((e) => e.type === t).length;
    const times = mine.map((e) => Date.parse(e.timestamp));
    const stats: Record<string, number> = {
      mayor: { tasks: count('plan.created') },
      scout: { tables: count('schema.table_discovered'), links: count('schema.relationship_discovered') },
      inspector: { issues: count('data.issue_found') },
      engineer: { drafts: count('query.generated'), errors: count('query.execution_failed'), runs: count('query.execution_succeeded'), attempts: attempts.length },
      verifier: { passed: count('validation.check_passed'), failed: count('validation.check_failed'), warned: count('validation.check_warned'), repairs: count('repair.requested') },
      analyst: { verdicts: count('answer.approved') + count('answer.abstained') },
    }[agent];
    return {
      agent, outcome: mine.some((e) => e.type === 'agent.task_failed') ? 'failed' : mine.length ? 'done' : 'idle', events: mine.length,
      activeMs: times.length > 1 ? Math.max(...times) - Math.min(...times) : 0,
      highlights: mine.filter((e) => !['agent.task_started', 'query.execution_started'].includes(e.type)).slice(-5).map((e) => e.summary), stats,
    };
  });
}
