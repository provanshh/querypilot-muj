/**
 * Shared contract between the agent backend and the game client.
 * Every visual in the game is driven by one of these events.
 */

export type AgentId = 'mayor' | 'scout' | 'inspector' | 'engineer' | 'verifier' | 'analyst';
/** A game island: one per uploaded dataset, keyed by the dataset id. */
export type IslandId = string;

export type QuestEventType =
  | 'run.started'
  | 'plan.created'
  | 'agent.task_started'
  | 'agent.task_waiting'
  | 'agent.task_succeeded'
  | 'agent.task_failed'
  | 'agent.say'
  | 'schema.table_discovered'
  | 'schema.relationship_discovered'
  | 'schema.relevance'
  | 'data.issue_found'
  | 'data.profile_clean'
  | 'query.generated'
  | 'approval.requested'
  | 'approval.resolved'
  | 'query.execution_started'
  | 'query.execution_succeeded'
  | 'query.execution_failed'
  | 'validation.check_passed'
  | 'validation.check_failed'
  | 'validation.check_warned'
  | 'repair.requested'
  | 'answer.approved'
  | 'answer.abstained'
  | 'run.finished'
  | 'run.error';

export interface QuestEvent {
  run_id: string;
  event_id: string;
  seq: number;
  timestamp: string;
  type: QuestEventType;
  agent_id?: AgentId;
  task_id?: string;
  table_ids?: string[];
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface WorldColumn {
  name: string;
  type: string;
  pk: boolean;
  fk?: { table: string; column: string };
  description?: string;
  samples: string[];
}

export interface WorldTable {
  name: string;
  description?: string;
  rowCount: number;
  columns: WorldColumn[];
}

export interface WorldRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface WorldSchema {
  id: string;
  name: string;
  tables: WorldTable[];
  relationships: WorldRelationship[];
  rules: string[];
}

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  tables?: string[];
}

export interface QueryAttempt {
  attempt: number;
  sql: string;
  error?: string;
  rowCount?: number;
  durationMs?: number;
  failedChecks: string[];
}

export interface Verdict {
  status: 'answered' | 'abstained';
  question: string;
  answer: string;
  reason?: string;
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  sql?: string;
  attempts: QueryAttempt[];
  checks: CheckResult[];
  caveats: string[];
  assumptions: string[];
  trust: {
    schemaMapped: boolean;
    executed: boolean;
    checksPassed: number;
    checksFailed: number;
    checksWarned: number;
    independentlyVerified: boolean;
  };
  chart?: { label: string; value: number; compare?: number }[];
  /** 'llm' for questions answered by the agents; 'profiler' for audits, which are pure SQL profiling. */
  engine: { mode: 'llm' | 'profiler' };
  island?: string;
  crew?: CrewReportEntry[];
  elapsedMs: number;
  dataset?: string;
  mode?: 'ask' | 'audit';
  plan?: string;
  audit?: AuditSummary;
}

export interface AuditIssue {
  id: string;
  table: string;
  column?: string;
  kind: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  count: number;
  title: string;
  examples: string[];
  fix: string;
}

/** Before/after picture of a dataset produced by an audit mission. */
export interface AuditSummary {
  datasetId: string;
  scoreBefore: number;
  gradeBefore: string;
  scoreAfter: number;
  gradeAfter: string;
  issues: AuditIssue[];
  remaining: AuditIssue[];
  fixes: { table: string; column: string; role: string; transform: string }[];
  rowsBefore: Record<string, number>;
  rowsAfter: Record<string, number>;
  duplicatesRemoved: number;
}

/** What each agent actually did during a mission, built from the event log. */
export interface CrewReportEntry {
  agent: AgentId;
  outcome: 'done' | 'failed' | 'idle';
  events: number;
  activeMs: number;
  highlights: string[];
  stats: Record<string, number>;
}

export interface LlmStatus {
  available: boolean;
  model?: string;
  parameterSize?: string;
  eligible?: boolean;
  reason?: string;
  models?: { name: string; parameterSize?: string; eligible: boolean }[];
  quota?: { used: number; limit: number; remaining: number };
}

export type ApprovalMode = 'ask' | 'auto';

/** The master/worker crew: worker processes serving agent tasks, and the queue of the last 24 hours. */
export interface CrewStatus {
  workers: { id: string; agent: string; host: string; pid: number; tasksDone: number; lastSeen: string; startedAt: string; local: boolean }[];
  queue: Record<string, { queued: number; running: number; done: number; failed: number }>;
  mode: 'in-process' | 'external';
}
