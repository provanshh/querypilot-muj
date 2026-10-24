import type { CheckResult, QuestEvent } from './types';

/** Translates a backend event into one plain-language sentence a non-engineer can follow. Null = not worth narrating. */
export function narrate(e: QuestEvent, islandName: string): string | null {
  const md = e.metadata ?? {};
  switch (e.type) {
    case 'run.started':
      return `New question on ${islandName}: "${String(md.question ?? '')}". The Mayor is sending the crew out.`;
    case 'plan.created':
      return 'The Mayor splits the job: the Scout reads the map, the Inspector looks for messy data, the Engineer writes the query, the Verifier double-checks, and the Analyst explains the answer.';
    case 'schema.table_discovered': {
      const t = e.table_ids?.[0];
      return `The Scout found the "${t}" building. It's a table holding ${md.rowCount ?? 'some'} records.`;
    }
    case 'schema.relevance':
      return 'The Scout has worked out which buildings matter for this question.';
    case 'data.issue_found':
      return `The Inspector spotted messy data: ${simplifyIssue(e.summary)}`;
    case 'data.profile_clean':
      return 'The Inspector checked the data and it is clean. No traps here.';
    case 'query.generated':
      return Number(md.attempt ?? 1) === 1
        ? 'The Engineer wrote a database question, called SQL, to fetch the answer.'
        : `The Engineer rewrote the query, attempt number ${md.attempt}, using the Verifier's advice.`;
    case 'approval.requested':
      return 'The Engineer is asking you for permission to run the query. Press Y to allow it or N to refuse.';
    case 'query.execution_succeeded':
      return `The query ran on the real database and returned ${md.rowCount ?? 'some'} rows.`;
    case 'query.execution_failed':
      return /Blocked/.test(e.summary)
        ? 'The safety guard blocked that query because it was not read-only.'
        : 'The query crashed. The database refused to read a messy value as a number. The Verifier will figure out why.';
    case 'validation.check_failed': {
      const c = md.check as CheckResult | undefined;
      return `Trap caught! ${c?.label ?? 'A check failed'}. If we had answered now, the answer would have been wrong.`;
    }
    case 'repair.requested':
      return 'The Verifier sends the query back to the Engineer with instructions to fix it.';
    case 'agent.task_succeeded':
      return e.agent_id === 'verifier' ? 'Every check passed. The Verifier certifies the result.' : null;
    case 'answer.approved':
      return `Case solved. ${e.summary}`;
    case 'answer.abstained':
      return `The crew refuses to guess. ${e.summary}`;
    case 'run.error':
      return e.summary;
    default:
      return null;
  }
}

function simplifyIssue(summary: string) {
  if (/loaded more than once/.test(summary)) return 'some records were loaded twice, which would double-count them.';
  if (/placeholder/.test(summary)) return 'some numbers are written as "N/A" or a dash instead of being left blank.';
  if (/thousands separators/.test(summary)) return 'some numbers have commas in them, like 1,204.';
  if (/year formats/.test(summary)) return 'years are written in two different ways, like 2023-24 and 2023/24.';
  if (/percentages/.test(summary)) return 'percentages are stored as both 78% and 0.78.';
  if (/spellings/.test(summary)) return 'the same category is spelled several different ways.';
  return summary;
}

/** Events important enough to be spoken aloud in voice mode. */
export const SPOKEN = new Set<QuestEvent['type']>([
  'run.started', 'data.issue_found', 'data.profile_clean', 'approval.requested', 'query.execution_failed',
  'validation.check_failed', 'repair.requested', 'answer.approved', 'answer.abstained',
]);

let voiceOn = false;

export const voice = {
  supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },
  enabled() {
    return voiceOn;
  },
  setEnabled(on: boolean) {
    voiceOn = on;
    if (!on && voice.supported()) window.speechSynthesis.cancel();
  },
  say(text: string, opts: { force?: boolean; interrupt?: boolean } = {}) {
    if (!voice.supported() || (!voiceOn && !opts.force)) return;
    const synth = window.speechSynthesis;
    if (opts.interrupt || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[_*`]/g, ' '));
    u.rate = 1.04;
    u.pitch = 1;
    const v = synth.getVoices().find((x) => /en[-_](US|GB)/i.test(x.lang) && /Samantha|Google|Natural|Daniel|Karen/i.test(x.name))
      ?? synth.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    synth.speak(u);
  },
  stop() {
    if (voice.supported()) window.speechSynthesis.cancel();
  },
};
