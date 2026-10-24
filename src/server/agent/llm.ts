import type { LlmStatus } from '@/lib/quest/types';

/**
 * Open-weight models served through OpenRouter. Every agent call goes through `chatJson`, which walks
 * the model chain (QP_MODEL, comma separated, or DEFAULT_CHAIN) and skips models that are rate-limited.
 * Only catalogued models are accepted, so nothing larger can slip in through configuration.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

interface ModelInfo {
  id: string;
  /** Human-readable size: total parameters, plus active parameters for mixture-of-experts models. */
  params: string;
  activeB: number;
  totalB: number;
  free: boolean;
}

const MODEL_CATALOG: ModelInfo[] = [
  { id: 'cohere/north-mini-code:free', params: '30B MoE, 3B active', activeB: 3, totalB: 30, free: true },
  { id: 'recursive/flint-v1.0:free', params: '40B MoE, 2.5B active', activeB: 2.5, totalB: 40, free: true },
  { id: 'poolside/laguna-xs-2.1:free', params: '33B MoE, 3B active', activeB: 3, totalB: 33, free: true },
  { id: 'nvidia/nemotron-3.5-lightning:free', params: '30B MoE, 3B active', activeB: 3, totalB: 30, free: true },
  { id: 'google/gemma-4-26b-a4b-it:free', params: '25.2B MoE, 3.8B active', activeB: 3.8, totalB: 25.2, free: true },
  { id: 'xingchen-agi/xing4.0-29b-a4b:free', params: '29B MoE, 4B active', activeB: 4, totalB: 29, free: true },
  { id: 'poolside/laguna-s-2.1:free', params: '118B MoE, 8B active', activeB: 8, totalB: 118, free: true },
  { id: 'liquid/lfm-2.5-2.6b:free', params: '2.6B', activeB: 2.6, totalB: 2.6, free: true },
  { id: 'qwen/qwen-2.5-7b-instruct', params: '7.6B', activeB: 7.6, totalB: 7.6, free: false },
  { id: 'qwen/qwen2.5-coder-7b-instruct', params: '7.6B', activeB: 7.6, totalB: 7.6, free: false },
  { id: 'meta-llama/llama-3.1-8b-instruct', params: '8B', activeB: 8, totalB: 8, free: false },
  { id: 'mistralai/mistral-7b-instruct', params: '7.3B', activeB: 7.3, totalB: 7.3, free: false },
  { id: 'google/gemma-3-4b-it', params: '4B', activeB: 4, totalB: 4, free: false },
];

/** Ranked by the free-model benchmark (scripts/bench-models.ts). */
const DEFAULT_CHAIN = [
  'cohere/north-mini-code:free',
  'recursive/flint-v1.0:free',
  'poolside/laguna-xs-2.1:free',
  'nvidia/nemotron-3.5-lightning:free',
];

const info = (id: string) => MODEL_CATALOG.find((m) => m.id === id);
const apiKey = () => process.env.OPENROUTER_API_KEY?.trim() || '';

function modelChain(): ModelInfo[] {
  const want = process.env.QP_MODEL?.split(',').map((s) => s.trim()).filter(Boolean);
  return (want?.length ? want : DEFAULT_CHAIN).map(info).filter((m): m is ModelInfo => !!m);
}

let statusCache: { at: number; status: LlmStatus } | null = null;

/** End users see a plain reason; the provider-specific detail goes only to the server log. */
const CONFIG = 'The agents are not configured on this server.';
const BUSY = 'The agents have reached their usage limit for today. Try again later.';
const DOWN = 'The agents cannot be reached right now. Try again in a minute.';
function unavailable(reason: string, detail: string): string {
  console.warn(`[llm] ${detail}`);
  return reason;
}

export async function getLlmStatus(force = false): Promise<LlmStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 60_000) return statusCache.status;
  const chain = modelChain();
  const models = chain.map((m) => ({ name: m.id, parameterSize: m.params, eligible: m.activeB <= 8 }));
  let status: LlmStatus;
  if (!chain.length) {
    status = { available: false, reason: unavailable(CONFIG, `QP_MODEL="${process.env.QP_MODEL}" lists no catalogued model`), models };
  } else if (!apiKey()) {
    status = { available: false, reason: unavailable(CONFIG, 'OPENROUTER_API_KEY is not set'), models };
  } else {
    try {
      const res = await fetch(`${OPENROUTER_URL}/key`, { headers: { Authorization: `Bearer ${apiKey()}` }, signal: AbortSignal.timeout(5000) });
      const body = res.ok ? ((await res.json()) as { data?: { free_model_daily_requests?: { used: number; limit: number; remaining: number } } }).data : undefined;
      const quota = body?.free_model_daily_requests;
      const spent = !!quota && quota.remaining <= 0 && chain.every((m) => m.free);
      status = !res.ok
        ? { available: false, reason: unavailable(CONFIG, `API key rejected (HTTP ${res.status})`), models }
        : spent
          ? { available: false, reason: unavailable(BUSY, `free daily quota used up (${quota.used}/${quota.limit})`), models, quota }
          : { available: true, model: chain[0].id, parameterSize: chain[0].params, eligible: chain[0].activeB <= 8, models, quota };
    } catch (err) {
      status = { available: false, reason: unavailable(DOWN, `provider unreachable: ${err instanceof Error ? err.message : String(err)}`), models };
    }
  }
  statusCache = { at: Date.now(), status };
  return status;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface ChatResult<T> { data: T; model: string; ms: number }

export class LlmUnavailableError extends Error {}

/** Models that answered 429 recently are skipped until this time. */
const cooldown = new Map<string, number>();

function parseJson<T>(content: string): T {
  const text = content.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error('reply was not JSON');
  }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
});

/**
 * One JSON-returning chat call. Tries each model in the chain; a model that is rate-limited, errors,
 * times out or returns non-JSON is skipped. Throws LlmUnavailableError when every model failed.
 */
export async function chatJson<T>(messages: ChatMessage[], opts: { signal?: AbortSignal; maxTokens?: number; models?: ModelInfo[] } = {}): Promise<ChatResult<T>> {
  if (!apiKey()) throw new LlmUnavailableError(unavailable(CONFIG, 'OPENROUTER_API_KEY is not set'));
  const chain = opts.models ?? modelChain();
  if (!chain.length) throw new LlmUnavailableError(unavailable(CONFIG, 'no catalogued model in QP_MODEL'));
  const failures: string[] = [];
  for (let round = 0; round < 2; round += 1) {
    for (const m of chain) {
      if (opts.signal?.aborted) throw new Error('aborted');
      if ((cooldown.get(m.id) ?? 0) > Date.now() && round === 0) { failures.push(`${m.id}: cooling down`); continue; }
      const t0 = Date.now();
      try {
        const timeout = AbortSignal.timeout(45_000);
        const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://querypilot.local', 'X-Title': 'QueryPilot' },
          body: JSON.stringify({ model: m.id, messages, temperature: 0, max_tokens: opts.maxTokens ?? 4000, reasoning: { effort: 'low' } }),
          signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
        });
        if (!res.ok) {
          const text = (await res.text()).slice(0, 300);
          if (res.status === 429 && /per.day|daily|free-models-per/i.test(text)) {
            throw new LlmUnavailableError(unavailable(BUSY, 'free daily quota used up'));
          }
          if (res.status === 429) cooldown.set(m.id, Date.now() + 30_000);
          if (res.status === 401 || res.status === 402) throw new LlmUnavailableError(unavailable(CONFIG, `request refused (HTTP ${res.status}): ${text}`));
          failures.push(`${m.id}: HTTP ${res.status}`);
          continue;
        }
        const data = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content ?? '';
        if (!content.trim()) { failures.push(`${m.id}: no answer (${data.choices?.[0]?.finish_reason === 'length' ? 'ran out of tokens while reasoning' : 'empty reply'})`); continue; }
        return { data: parseJson<T>(content), model: m.id, ms: Date.now() - t0 };
      } catch (err) {
        if (err instanceof LlmUnavailableError) throw err;
        if (opts.signal?.aborted) throw new Error('aborted');
        failures.push(`${m.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (round === 0) await sleep(2500, opts.signal);
  }
  throw new LlmUnavailableError(unavailable(DOWN, `every model failed: ${failures.slice(-4).join('; ')}`));
}
