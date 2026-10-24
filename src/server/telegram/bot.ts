import { db } from '@/server/db/prisma';
import { subscribe, type LivePayload } from '@/server/live';
import { getRun } from '@/server/agent/runs';
import { launchMission, LaunchError, type LaunchOptions } from '@/server/agent/launch';
import { listRuns, runEvents } from '@/server/agent/persist';
import { getDataset, listDatasets, type DatasetDef } from '@/server/datasets/registry';
import { editRules } from '@/server/datasets/dictionary';
import { analyzeDataset } from '@/server/engine/analyze';
import { compareTable } from '@/server/engine/compare';
import { datasetDetail, safeSummary } from '@/server/engine/summary';
import { storeUpload } from '@/server/engine/upload';
import type { AgentId, Verdict } from '@/lib/quest/types';
import { botToken, botUsername, downloadFile, esc, tg, TgError, type InlineButton, type InlineKeyboard, type TgCallback, type TgMessage, type TgUpdate } from './api';

/** Bump when the bot's code changes so a hot-reloaded server replaces the old poller. */
const VERSION = 'qp-bot-7';

const AGENTS: { id: AgentId; icon: string; name: string }[] = [
  { id: 'mayor', icon: '🧭', name: 'Orchestrator' },
  { id: 'scout', icon: '🗺', name: 'Schema Explorer' },
  { id: 'inspector', icon: '🔎', name: 'Quality Inspector' },
  { id: 'engineer', icon: '🛠', name: 'SQL Engineer' },
  { id: 'verifier', icon: '🛡', name: 'Verifier' },
  { id: 'analyst', icon: '📝', name: 'Analyst' },
];
const DS = '📄';
const SOURCE_LABEL: Record<string, string> = { dashboard: '🖥 Dashboard', game: '🎮 Game', telegram: '📱 Telegram', script: '⚙️ Script' };
const STATE_ICON = { idle: '▫️', working: '⏳', done: '✅', failed: '⚠️' } as const;
const PAGE = 5;
/** Telegram rejects the whole message when any callback_data is longer than this. */
const MAX_CALLBACK_BYTES = 64;
const MAX_TEXT = 4000;

/**
 * Callback routes. Every button carries a short code plus ids or indexes (never table names),
 * so payloads stay far below Telegram's 64-byte limit.
 */
const R = {
  menu: 'm',
  help: 'h',
  datasets: 'd',
  questions: 'q',
  ownQuestion: 'k',
  audit: 'a',
  compare: 'c',
  browse: 'b',
  history: 'r',
  result: 'rt',
  sql: 'rs',
  again: 'rr',
  stop: 'x',
  follow: 'f',
  rules: 'u',
} as const;

const btn = (text: string, data: string): InlineButton => ({ text, callback_data: data });
const HOME = btn('🏠 Menu', R.menu);

/** Bottom keyboard. Matched by its words, so older labels and typed variants still work. */
const KEYS = {
  ask: '💬 Ask a question',
  audit: '🩺 Data health',
  compare: '📊 Before vs after',
  browse: '🗂 Browse data',
  datasets: '📁 Datasets',
  history: '🕘 Recent runs',
  menu: '🏠 Menu',
  help: '❓ Help',
} as const;
const REPLY_KEYBOARD = {
  keyboard: [
    [{ text: KEYS.ask }, { text: KEYS.audit }],
    [{ text: KEYS.compare }, { text: KEYS.browse }],
    [{ text: KEYS.datasets }, { text: KEYS.history }],
    [{ text: KEYS.menu }, { text: KEYS.help }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Ask the data anything…',
};
const KEY_WORDS: Record<string, keyof typeof KEYS> = {
  askaquestion: 'ask', suggestedquestions: 'ask', questions: 'ask',
  datahealth: 'audit', audit: 'audit',
  beforevsafter: 'compare', compare: 'compare',
  browsedata: 'browse', browse: 'browse', data: 'browse',
  datasets: 'datasets',
  recentruns: 'history', history: 'history',
  menu: 'menu', start: 'menu',
  help: 'help', howitworks: 'help',
};
const keyOf = (text: string) => KEY_WORDS[text.toLowerCase().replace(/[^a-z]/g, '')];

interface Chat { id: number; dataset: string; follow: boolean; title?: string }
type AgentState = keyof typeof STATE_ICON;

/** One Telegram message that is edited in place as things happen, at most ~1 edit per 1.3 s. */
class LiveMessage {
  id?: number;
  private lastText = '';
  private lastEdit = 0;
  private dirty = false;
  private busy = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(public chatId: number, private render: () => { text: string; kb?: InlineKeyboard }) {}

  touch(now = false) {
    this.dirty = true;
    if (this.busy || this.timer) return;
    const wait = now ? 0 : Math.max(0, this.lastEdit + 1300 - Date.now());
    this.timer = setTimeout(() => { this.timer = undefined; void this.pump(); }, wait);
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const { text, kb } = this.render();
        if (text === this.lastText) continue;
        const markup = { inline_keyboard: safeKb(kb ?? []) };
        if (!this.id) {
          const m = await html<TgMessage>('sendMessage', { chat_id: this.chatId, text, reply_markup: markup });
          this.id = m.message_id;
        } else {
          await html('editMessageText', { chat_id: this.chatId, message_id: this.id, text, reply_markup: markup });
        }
        this.lastText = text;
        this.lastEdit = Date.now();
        if (this.dirty) await sleep(1300);
      }
    } catch (err) {
      if (err instanceof TgError && /not modified/i.test(err.message)) { /* same text */ }
      else if (err instanceof TgError && err.retryAfter) { await sleep(err.retryAfter * 1000); this.dirty = true; }
      else note(err);
    } finally {
      this.busy = false;
      if (this.dirty) this.touch();
    }
  }
}

interface RunCard {
  runId: string;
  source: string;
  dataset: string;
  dsName?: string;
  mode: 'ask' | 'audit';
  question: string;
  startedAt: number;
  events: number;
  agents: Record<AgentId, { state: AgentState; last?: string }>;
  latest?: string;
  final?: { status: string; answer?: string; reason?: string; verdict?: Verdict | null; error?: string };
  msgs: Map<number, LiveMessage>;
  origin?: number;
}

interface GameSession { lines: { at: number; text: string }[]; closed: boolean; msg: LiveMessage; startedAt: number }

interface BotState {
  version: string;
  stopped: boolean;
  ac: AbortController;
  unsub?: () => void;
  offset: number;
  startedAt: number;
  chats: Map<number, Chat>;
  cards: Map<string, RunCard>;
  origins: Map<string, number>;
  games: Map<number, GameSession>;
  busyChats: Set<number>;
  /** Chats that already have this version's bottom keyboard. */
  keyboards: Set<number>;
  updates: number;
  lastError?: string;
}

const g = globalThis as unknown as { __qpBot?: BotState };
const state = () => g.__qpBot!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clip = (s: string | undefined, n: number) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const dsOf = (p: { dataset?: string; island?: string }) => p.dataset || p.island || '';
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const note = (err: unknown) => { if (g.__qpBot) g.__qpBot.lastError = errText(err); };

export function botStatus() {
  const s = g.__qpBot;
  return {
    configured: !!botToken(),
    running: !!s && !s.stopped,
    username: botUsername(),
    link: `https://t.me/${botUsername()}`,
    chats: s ? [...s.chats.values()].length : 0,
    following: s ? [...s.chats.values()].filter((c) => c.follow).length : 0,
    updates: s?.updates ?? 0,
    since: s?.startedAt ? new Date(s.startedAt).toISOString() : null,
    lastError: s?.lastError ?? null,
  };
}

/** Starts the long-polling bot once per server process (replacing an older hot-reloaded copy). */
export function ensureBot() {
  if (!botToken()) return;
  const cur = g.__qpBot;
  if (cur && !cur.stopped && cur.version === VERSION) return;
  if (cur) { cur.stopped = true; cur.ac.abort(); cur.unsub?.(); }
  const s: BotState = {
    version: VERSION, stopped: false, ac: new AbortController(), offset: 0, startedAt: Date.now(),
    chats: cur?.chats ?? new Map(), cards: new Map(), origins: new Map(), games: new Map(), busyChats: new Set(), keyboards: new Set(), updates: 0,
  };
  g.__qpBot = s;
  void boot(s);
}

async function boot(s: BotState) {
  try {
    const rows = await db().tgChat.findMany();
    for (const r of rows) s.chats.set(Number(r.chatId), { id: Number(r.chatId), dataset: r.dataset ?? '', follow: r.follow, title: r.title ?? undefined });
    await tg('deleteWebhook', { drop_pending_updates: false });
    await setupProfile().catch(note);
    s.unsub = await subscribe((p) => { if (!s.stopped) onLive(s, p); });
  } catch (err) {
    note(err);
  }
  void poll(s);
}

async function setupProfile() {
  await tg('setMyCommands', {
    commands: [
      { command: 'menu', description: 'Main menu' },
      { command: 'ask', description: 'Ask a question, e.g. /ask total balance by branch' },
      { command: 'audit', description: 'Data-health audit of the current dataset' },
      { command: 'compare', description: 'Before vs after cleaning' },
      { command: 'data', description: 'Browse raw and cleaned rows' },
      { command: 'datasets', description: 'Switch dataset or upload a CSV' },
      { command: 'history', description: 'Recent runs from every surface' },
      { command: 'live', description: 'Turn the live feed of dashboard/game runs on or off' },
      { command: 'rules', description: 'Business rules the agents must follow' },
      { command: 'rule', description: 'Add a rule, e.g. /rule Revenue excludes refunds' },
      { command: 'help', description: 'How QueryPilot works' },
    ],
  });
  await tg('setChatMenuButton', { menu_button: { type: 'commands' } });
  await tg('setMyShortDescription', { short_description: 'Ask messy data in plain English. Six agents explore, clean, verify — or decline honestly.' });
  await tg('setMyDescription', {
    description: 'QueryPilot is an agentic data analyst for messy databases. Ask in plain English; six agents map the schema, clean dirty values, write read-only SQL, verify the result and answer, or decline when the data cannot support an answer. Runs from the dashboard and the game appear here live. You can also send a CSV to have it audited.',
  });
}

async function poll(s: BotState) {
  while (!s.stopped) {
    try {
      const updates = await tg<TgUpdate[]>('getUpdates', { offset: s.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, s.ac.signal);
      for (const u of updates) {
        s.offset = u.update_id + 1;
        s.updates += 1;
        void handleUpdate(u);
      }
    } catch (err) {
      if (s.stopped) return;
      note(err);
      await sleep(err instanceof TgError && err.code === 409 ? 3000 : 2000);
    }
  }
}

// ---------------------------------------------------------------- sending

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Drops any button Telegram would reject, so one bad button never kills a whole menu. */
function safeKb(kb: InlineKeyboard): InlineKeyboard {
  return kb
    .map((row) => row.filter((b) => {
      if (!b.callback_data || Buffer.byteLength(b.callback_data) <= MAX_CALLBACK_BYTES) return true;
      note(new Error(`button dropped, callback_data too long: ${b.callback_data}`));
      return false;
    }))
    .filter((row) => row.length);
}

/** Sends HTML, retrying as plain text if Telegram cannot parse it. */
async function html<T = unknown>(method: string, body: Record<string, unknown> & { text: string }): Promise<T> {
  const text = body.text.length > MAX_TEXT ? `${body.text.slice(0, MAX_TEXT)}…` : body.text;
  try {
    return await tg<T>(method, { ...body, text, parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (err) {
    if (!(err instanceof TgError) || !/parse entities|unsupported start tag|can't find end/i.test(err.message)) throw err;
    return tg<T>(method, { ...body, text: stripHtml(text), disable_web_page_preview: true });
  }
}

const send = (chatId: number, text: string, kb?: InlineKeyboard | Record<string, unknown>) =>
  html<TgMessage>('sendMessage', { chat_id: chatId, text, reply_markup: Array.isArray(kb) ? { inline_keyboard: safeKb(kb) } : kb });

/** Shows a screen: edits the menu message in place when there is one, otherwise sends a new one. */
async function show(chatId: number, text: string, kb: InlineKeyboard, editId?: number) {
  if (editId) {
    try {
      await html('editMessageText', { chat_id: chatId, message_id: editId, text, reply_markup: { inline_keyboard: safeKb(kb) } });
      return;
    } catch (err) {
      if (err instanceof TgError && /not modified/i.test(err.message)) return;
    }
  }
  await send(chatId, text, kb);
}

const typing = (chatId: number) => tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

// ---------------------------------------------------------------- chats

async function chatFor(m: TgMessage): Promise<Chat> {
  const s = state();
  const existing = s.chats.get(m.chat.id);
  if (existing) return existing;
  const c: Chat = { id: m.chat.id, dataset: '', follow: true, title: m.chat.title ?? m.chat.username ?? m.chat.first_name };
  s.chats.set(c.id, c);
  await db().tgChat.createMany({ data: [{ chatId: BigInt(c.id), title: c.title, dataset: null, follow: c.follow }], skipDuplicates: true }).catch(note);
  return c;
}

async function saveChat(c: Chat) {
  await db().tgChat.updateMany({ where: { chatId: BigInt(c.id) }, data: { dataset: c.dataset || null, follow: c.follow } }).catch(note);
}

/** The chat's dataset; falls back to the newest upload when none is picked or it was deleted. */
async function currentDataset(chat: Chat): Promise<DatasetDef | null> {
  const picked = chat.dataset ? await getDataset(chat.dataset) : null;
  if (picked) return picked;
  const [newest] = await listDatasets();
  if (!newest) return null;
  chat.dataset = newest.id;
  await saveChat(chat);
  return newest;
}

function noDataset(chat: Chat, editId?: number) {
  return show(chat.id, [
    '📂 <b>No dataset yet</b>',
    '',
    'Send a <b>.csv</b> file in this chat (up to 2 MB). The agents store it untouched, audit it, and then you can ask it questions.',
    '',
    '<i>Files uploaded on the dashboard show up here too.</i>',
  ].join('\n'), [[btn('📁 Datasets', R.datasets), HOME]], editId);
}

async function ensureKeyboard(chat: Chat, force = false) {
  const s = state();
  if (!force && s.keyboards.has(chat.id)) return;
  await send(chat.id, force ? '👋 <b>Welcome to QueryPilot</b>\nQuick buttons are pinned below the chat. Type any question at any time.' : '⌨️ Quick buttons refreshed below the chat.', REPLY_KEYBOARD);
  s.keyboards.add(chat.id);
}

// ---------------------------------------------------------------- updates

async function handleUpdate(u: TgUpdate) {
  const chatId = u.callback_query?.message?.chat.id ?? u.message?.chat.id;
  try {
    if (u.callback_query) await onCallback(u.callback_query);
    else if (u.message) await onMessage(u.message);
  } catch (err) {
    note(err);
    if (chatId) await send(chatId, `⚠️ <b>That didn't work.</b>\n<i>${esc(clip(errText(err), 300))}</i>`, [[HOME]]).catch(note);
  }
}

async function onMessage(m: TgMessage) {
  const chat = await chatFor(m);
  if (m.document) return onDocument(chat, m);
  const text = (m.text ?? '').trim();
  if (!text) return;
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith('/') ? cmdRaw.slice(1).split('@')[0].toLowerCase() : '';
  const arg = rest.join(' ').trim();
  const key = cmd ? undefined : keyOf(text);

  if (cmd === 'start') { await ensureKeyboard(chat, true); return mainMenu(chat); }
  if (cmd === 'menu' || key === 'menu') { await ensureKeyboard(chat); return mainMenu(chat); }
  if (cmd === 'help' || key === 'help') return help(chat);
  if (cmd === 'datasets' || key === 'datasets') return datasetsMenu(chat);
  if (cmd === 'audit' || key === 'audit') return startRun(chat, { mode: 'audit' });
  if (cmd === 'compare' || key === 'compare') return compareMenu(chat);
  if (cmd === 'data' || key === 'browse') return browseMenu(chat);
  if (cmd === 'history' || key === 'history') return history(chat);
  if (key === 'ask') return questions(chat);
  if (cmd === 'live') {
    chat.follow = !chat.follow;
    await saveChat(chat);
    return send(chat.id, chat.follow ? '🔔 Live feed <b>on</b>: dashboard and game runs will appear here.' : '🔕 Live feed <b>off</b>: you will only see runs you start here.', [[HOME]]);
  }
  if (cmd === 'ask') return arg ? startRun(chat, { mode: 'ask', question: arg }) : questions(chat);
  if (cmd === 'rules') return rulesMenu(chat);
  if (cmd === 'rule') {
    if (!arg) return send(chat.id, '⚖️ Add a business rule like this:\n<code>/rule Revenue excludes refunded orders</code>', [[btn('⚖️ Rules', R.rules), HOME]]);
    const def = await currentDataset(chat);
    if (!def) return noDataset(chat);
    await editRules(def.id, { add: arg });
    return rulesMenu(chat, undefined, '✅ Rule saved. The agents apply it from the next question.');
  }
  if (cmd) return send(chat.id, `Unknown command <code>/${esc(cmd)}</code>.`, [[HOME, btn('❓ Help', R.help)]]);
  if (text.length < 4) return send(chat.id, 'Type a full question, e.g. <i>total sales by region</i>, or open the menu.', [[btn('💬 Suggested questions', R.questions), HOME]]);
  return startRun(chat, { mode: 'ask', question: text });
}

/** Instant feedback shown on the button tap, before the (sometimes slow) screen loads. */
const TOAST: Record<string, string> = {
  [R.audit]: '🩺 Starting the audit…',
  [R.questions]: 'Loading questions…',
  [R.compare]: 'Comparing…',
  [R.browse]: 'Loading rows…',
  [R.history]: 'Loading runs…',
  [R.again]: '🔁 Running again…',
};

/** Callback codes used by earlier versions of the bot, so old messages keep working. */
const LEGACY: Record<string, string> = {
  menu: R.menu, help: R.help, dsl: R.datasets, ds: R.datasets, sq: R.questions, au: R.audit,
  cmp: R.compare, hist: R.history, run: R.history, res: R.result, sql: R.sql, again: R.again, stop: R.stop, fol: R.follow,
};

async function onCallback(q: TgCallback) {
  const m = q.message;
  const answer = (text?: string, alert = false) => tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: alert }).catch(() => {});
  if (!m || !q.data) return answer();
  const chat = await chatFor(m);
  const [raw, a = '', b = '', c = ''] = q.data.split(':');
  const edit = m.message_id;
  if (raw === 'ask' || raw === 'ct' || raw === 'br') {
    await answer('That menu is out of date, here is a fresh one.');
    return mainMenu(chat, edit);
  }
  const kind = LEGACY[raw] ?? raw;
  if (kind !== R.stop && kind !== R.follow && kind !== R.questions) void answer(TOAST[kind]);

  switch (kind) {
    case R.menu: return mainMenu(chat, edit);
    case R.help: return help(chat, edit);
    case R.datasets:
      if (!a) return datasetsMenu(chat, edit);
      chat.dataset = a;
      await saveChat(chat);
      return datasetCard(chat, edit);
    case R.questions:
      if (!a) { void answer(TOAST[kind]); return questions(chat, edit); }
      return askSuggested(chat, a, Number(b), answer);
    case R.ownQuestion:
      return send(chat.id, '✍️ <b>Type your question</b> as a reply. Use the column names in your own words.', { force_reply: true, input_field_placeholder: 'e.g. total balance by branch' });
    case R.audit: return startRun(chat, { mode: 'audit' });
    case R.compare: return a ? compareTableMsg(chat, Number(a), edit) : compareMenu(chat, edit);
    case R.browse: return a ? browseRows(chat, Number(a), b === 'c' ? 'clean' : 'raw', Number(c) || 0, edit) : browseMenu(chat, edit);
    case R.history: return a ? runSummary(chat, a, edit) : history(chat, edit);
    case R.result: return resultTable(chat, a);
    case R.sql: return sqlOf(chat, a);
    case R.again: return again(chat, a);
    case R.stop: {
      const r = getRun(a);
      if (!r) return answer('That run has already finished.');
      r.abort.abort();
      return answer('⏹ Stopping the run…');
    }
    case R.rules: {
      if (!a) return rulesMenu(chat, edit);
      const def = await currentDataset(chat);
      if (!def) return noDataset(chat, edit);
      await editRules(def.id, { removeIndex: Number(a) });
      return rulesMenu(chat, edit, `🗑 Rule R${Number(a) + 1} removed.`);
    }
    case R.follow:
      chat.follow = !chat.follow;
      await saveChat(chat);
      await answer(chat.follow ? '🔔 Live feed on' : '🔕 Live feed off');
      return mainMenu(chat, edit);
    default:
      return mainMenu(chat, edit);
  }
}

// ---------------------------------------------------------------- menus

async function mainMenu(chat: Chat, editId?: number) {
  const def = await currentDataset(chat).catch(() => null);
  const text = [
    '🧭 <b>QueryPilot</b> · agentic data analyst',
    'Ask messy data in plain English. Six agents explore it, clean dirty values, write <b>read-only</b> SQL, verify the result, then answer or decline honestly.',
    '',
    `📂 Dataset: <b>${def ? esc(def.name) : 'none yet'}</b>`,
    `${chat.follow ? '🔔' : '🔕'} Live feed: <b>${chat.follow ? 'on' : 'off'}</b> · dashboard and game runs appear here`,
    '',
    def ? '<i>Type any question, or pick an option below.</i>' : '<i>Send a .csv file to get started.</i>',
  ].join('\n');
  await show(chat.id, text, [
    [btn('💬 Ask a question', R.questions)],
    [btn('🩺 Data health', R.audit), btn('📊 Before vs after', R.compare)],
    [btn('🗂 Browse rows', R.browse), btn('🕘 Recent runs', R.history)],
    [btn(`📁 Dataset: ${def ? clip(def.name, 26) : 'pick or upload'}`, R.datasets)],
    [btn(chat.follow ? '🔔 Live feed: on' : '🔕 Live feed: off', R.follow), btn('❓ Help', R.help)],
  ], editId);
}

async function help(chat: Chat, editId?: number) {
  await show(chat.id, [
    '❓ <b>How QueryPilot works</b>',
    '',
    '🧭 <b>Orchestrator</b> plans the run and hands out tasks',
    '🗺 <b>Schema Explorer</b> maps tables, columns and keys',
    '🔎 <b>Quality Inspector</b> finds dirty values: text amounts, mixed dates, spelling variants, duplicates',
    '🛠 <b>SQL Engineer</b> writes read-only SQL on a cleaned view',
    '🛡 <b>Verifier</b> challenges every result and sends bad drafts back',
    '📝 <b>Analyst</b> answers with evidence, or declines',
    '',
    '<b>Using the bot</b>',
    '• Type any question, or tap <b>💬 Ask a question</b> for ideas',
    '• Send a <b>.csv</b> file to upload and audit it',
    '• <b>📊 Before vs after</b> shows exactly what cleaning changed',
    '• Tap <b>⏹ Stop</b> on a run card to cancel it',
    '',
    'Every run, from Telegram, the dashboard or the game, is saved and shows up everywhere live. Your data is never modified.',
  ].join('\n'), [[btn('💬 Ask a question', R.questions), HOME]], editId);
}

async function datasetsMenu(chat: Chat, editId?: number) {
  const all = await listDatasets();
  const current = await currentDataset(chat);
  const rows: InlineKeyboard = all.slice(0, 10).map((d) => [btn(`${current?.id === d.id ? '● ' : ''}${DS} ${clip(d.name, 40)}`, `${R.datasets}:${d.id}`)]);
  rows.push([HOME]);
  await show(chat.id, [
    '📁 <b>Datasets</b>',
    all.length ? 'Your uploaded files, newest first. Tap one to switch to it.' : 'No datasets yet.',
    '',
    '📎 <i>Send a .csv file in this chat to upload and audit a new one.</i>',
  ].join('\n'), rows, editId);
}

async function datasetCard(chat: Chat, editId?: number) {
  const def = await currentDataset(chat);
  if (!def) return noDataset(chat, editId);
  await typing(chat.id);
  const d = await datasetDetail(def, true).catch(() => null);
  const s = d?.summary ?? await safeSummary(def);
  const problems = s.issues.high + s.issues.medium + s.issues.low;
  const w = Math.min(22, Math.max(5, ...s.tables.map((t) => t.name.length)));
  const lines = [
    `${DS} <b>${esc(def.name)}</b> · selected`,
    '',
    `Clarity <b>${s.score}/100</b> (${esc(s.grade)})${d?.after ? ` → after cleaning <b>${d.after.score}/100</b>` : ''}`,
    `${s.tables.length} table${s.tables.length === 1 ? '' : 's'} · ${s.rows.toLocaleString()} rows · ${problems} problems · ${s.duplicates} duplicate rows`,
    '',
    `<pre>${esc(`${'table'.padEnd(w)}  rows  cols\n${s.tables.map((t) => `${clip(t.name, w).padEnd(w)} ${String(t.rows).padStart(5)} ${String(t.columns).padStart(5)}`).join('\n')}`)}</pre>`,
  ];
  const top = d?.issues?.filter((i) => i.severity !== 'info').slice(0, 5) ?? [];
  if (top.length) {
    lines.push('<b>Top problems found</b>');
    top.forEach((i) => lines.push(`• ${i.severity === 'high' ? '🔴' : i.severity === 'medium' ? '🟠' : '🟡'} ${esc(clip(i.title, 90))}${i.examples?.length ? ` <code>${esc(clip(i.examples.slice(0, 2).join(', '), 40))}</code>` : ''}`));
  }
  await show(chat.id, lines.join('\n'), [
    [btn('💬 Ask a question', R.questions), btn('🩺 Run audit', R.audit)],
    [btn('📊 Before vs after', R.compare), btn('🗂 Browse rows', R.browse)],
    [btn(`⚖️ Business rules (${def.rules.length})`, R.rules)],
    [btn('◀ Datasets', R.datasets), HOME],
  ], editId);
}

async function rulesMenu(chat: Chat, editId?: number, notice?: string) {
  const def = await currentDataset(chat);
  if (!def) return noDataset(chat, editId);
  await show(chat.id, [
    ...(notice ? [notice, ''] : []),
    `⚖️ <b>Business rules</b> · ${DS} ${esc(def.name)}`,
    'Definitions the agents must follow, written by you. They cite each rule they apply.',
    '',
    def.rules.length ? def.rules.map((r, i) => `<b>R${i + 1}.</b> ${esc(r)}`).join('\n') : '<i>No rules yet.</i>',
    '',
    'Add one: <code>/rule Revenue excludes refunded orders</code>',
    '<i>Column meanings and codes can be edited on the dashboard under Datasets.</i>',
  ].join('\n'), [
    ...def.rules.map((r, i) => [btn(`🗑 Remove R${i + 1}: ${clip(r, 36)}`, `${R.rules}:${i}`)]),
    [btn('◀ Dataset', `${R.datasets}:${def.id}`), HOME],
  ], editId);
}

async function questions(chat: Chat, editId?: number) {
  const def = await currentDataset(chat);
  if (!def) return noDataset(chat, editId);
  const s = await safeSummary(def);
  const kb: InlineKeyboard = s.questions.slice(0, 8).map((q, i) => [btn(`💬 ${clip(q.question, 58)}`, `${R.questions}:${def.id}:${i}`)]);
  kb.push([btn('✍️ Type my own question', R.ownQuestion)]);
  kb.push([btn('📁 Switch dataset', R.datasets), HOME]);
  await show(chat.id, [
    `💬 <b>Ask a question</b> · ${DS} ${esc(def.name)}`,
    s.questions.length ? 'Ideas built from this dataset\'s own columns. Tap one to run it.' : 'No suggestions for this dataset.',
    '',
    '<i>Or just type your own question in the chat.</i>',
  ].join('\n'), kb, editId);
}

async function askSuggested(chat: Chat, dsId: string, index: number, answer: (text?: string, alert?: boolean) => Promise<unknown>) {
  const def = await getDataset(dsId);
  const q = def ? (await safeSummary(def)).questions[index] : undefined;
  if (!def || !q) { await answer('That question is no longer available.', true); return questions(chat); }
  void answer('💬 Asking the agents…');
  return startRun(chat, { dataset: def.id, mode: 'ask', question: q.question });
}

// ---------------------------------------------------------------- before / after

async function tablesOf(chat: Chat) {
  const def = await currentDataset(chat);
  if (!def) return null;
  return { def, a: await analyzeDataset(def) };
}

async function compareMenu(chat: Chat, editId?: number): Promise<void> {
  const ctx = await tablesOf(chat);
  if (!ctx) return noDataset(chat, editId);
  const { def, a } = ctx;
  const order = a.tables
    .map((t, i) => ({ t, i, fixes: t.columns.filter((c) => c.transform).length, removed: t.dedupe?.removed ?? 0 }))
    .sort((x, y) => y.removed - x.removed || y.fixes - x.fixes);
  const kb: InlineKeyboard = order.map(({ t, i, fixes, removed }) => [btn(`📋 ${clip(t.name, 30)} · ${fixes} fixes${removed ? ` · ${removed} dupes` : ''}`, `${R.compare}:${i}`)]);
  if (order.length === 1) return compareTableMsg(chat, order[0].i, editId);
  kb.push([HOME]);
  await show(chat.id, `📊 <b>Before vs after</b> · ${DS} ${esc(def.name)}\nPick a table to see the original values next to what the agents read after cleaning.`, kb, editId);
}

async function compareTableMsg(chat: Chat, index: number, editId?: number): Promise<void> {
  const ctx = await tablesOf(chat);
  if (!ctx) return noDataset(chat, editId);
  const table = ctx.a.tables[index]?.name;
  if (!table) return compareMenu(chat, editId);
  await typing(chat.id);
  const c = await compareTable(ctx.a, table, 'changed', 5);
  const lines = [
    `📊 <b>${esc(table)}</b> · before → after`,
    `Rows <b>${c.totals.rows}</b> → <b>${c.totals.rows - c.totals.droppedRows}</b>${c.totals.droppedRows ? ` (${c.totals.droppedRows} duplicates removed${c.dedupe ? ` by ${esc(c.dedupe.keys.slice(0, 3).join(' + '))}` : ''})` : ''}`,
    `Cells corrected: <b>${c.totals.changedCells}</b> in ${c.totals.changedRows} rows`,
  ];
  if (c.distributions.length) lines.push(`Categories: ${c.distributions.map((d) => `<code>${esc(d.column)}</code> ${d.before.length}→${d.after.length}`).join(', ')}`);
  const fixes = c.stats.filter((s) => s.transform).slice(0, 6);
  if (fixes.length) { lines.push('', '<b>Cleaning applied</b>'); fixes.forEach((s) => lines.push(`• <code>${esc(s.column)}</code>: ${esc(clip(s.transform, 70))}`)); }
  const sample = c.rows.slice(0, 4).map((r) => {
    const changed = r.cells.map((cell, i) => ({ cell, col: c.columns[i] })).filter((x) => x.cell.changed).slice(0, 4);
    const head = r.status === 'dropped' ? '✗ duplicate, excluded' : '✓ kept';
    return [head, ...changed.map((x) => `  ${x.col.padEnd(10).slice(0, 10)} ${clip(x.cell.raw === null ? '∅' : `'${x.cell.raw}'`, 16).padEnd(16)} → ${clip(x.cell.clean === null ? 'missing' : String(x.cell.clean), 14)}`)].join('\n');
  });
  if (sample.length) lines.push('', '<b>Examples</b>', `<pre>${esc(sample.join('\n'))}</pre>`);
  await show(chat.id, lines.join('\n'), [
    [btn('🗂 Raw rows', `${R.browse}:${index}:r:0`), btn('🧹 Cleaned rows', `${R.browse}:${index}:c:0`)],
    [...(ctx.a.tables.length > 1 ? [btn('◀ Tables', R.compare)] : []), HOME],
  ], editId);
}

async function browseMenu(chat: Chat, editId?: number): Promise<void> {
  const ctx = await tablesOf(chat);
  if (!ctx) return noDataset(chat, editId);
  if (ctx.a.tables.length === 1) return browseRows(chat, 0, 'raw', 0, editId);
  const kb: InlineKeyboard = ctx.a.tables.map((t, i) => [btn(`📋 ${clip(t.name, 34)} (${t.rows} rows)`, `${R.browse}:${i}:r:0`)]);
  kb.push([HOME]);
  await show(chat.id, `🗂 <b>Browse data</b> · ${DS} ${esc(ctx.def.name)}\nSee every row raw (as stored) or cleaned (what the agents read).`, kb, editId);
}

async function browseRows(chat: Chat, index: number, view: 'raw' | 'clean', offset: number, editId?: number): Promise<void> {
  const ctx = await tablesOf(chat);
  if (!ctx) return noDataset(chat, editId);
  const table = ctx.a.tables[index]?.name;
  if (!table) return browseMenu(chat, editId);
  const c = await compareTable(ctx.a, table, 'all', PAGE, { offset });
  const total = c.matching;
  const records = c.rows.map((r, i) => {
    const head = `#${c.offset + i + 1}${r.status === 'dropped' ? (view === 'clean' ? '  ✗ duplicate, excluded' : '  ⚠ duplicate') : ''}`;
    return [head, ...r.cells.map((cell, j) => {
      const v = view === 'raw' ? (cell.raw === null ? '∅' : `'${cell.raw}'`) : cell.clean === null ? '∅' : String(cell.clean);
      return `${cell.changed ? '• ' : '  '}${c.columns[j].padEnd(11).slice(0, 11)} ${clip(v, 26)}`;
    })].join('\n');
  });
  const label = view === 'raw' ? '🗂 Raw (as stored)' : '🧹 Cleaned (what the agents read)';
  const text = [
    `${label} · <b>${esc(table)}</b>`,
    `Rows ${total ? offset + 1 : 0}–${Math.min(total, offset + PAGE)} of ${total} · • = value changed by cleaning`,
    `<pre>${esc(records.join('\n\n') || 'No rows.')}</pre>`,
  ].join('\n');
  const v = view === 'raw' ? 'r' : 'c';
  const nav: InlineButton[] = [];
  if (offset > 0) nav.push(btn('◀ Prev', `${R.browse}:${index}:${v}:${Math.max(0, offset - PAGE)}`));
  if (offset + PAGE < total) nav.push(btn('Next ▶', `${R.browse}:${index}:${v}:${offset + PAGE}`));
  await show(chat.id, text, [
    nav,
    [btn(view === 'raw' ? '🧹 Show cleaned' : '🗂 Show raw', `${R.browse}:${index}:${view === 'raw' ? 'c' : 'r'}:${offset}`), btn('📊 What changed', `${R.compare}:${index}`)],
    [...(ctx.a.tables.length > 1 ? [btn('◀ Tables', R.browse)] : []), HOME],
  ], editId);
}

// ---------------------------------------------------------------- runs

/** Starts a run for a chat. The live card is driven by the same NOTIFY feed every other surface uses. */
async function startRun(chat: Chat, opts: LaunchOptions): Promise<Verdict | null> {
  const s = state();
  const dataset = opts.dataset || (await currentDataset(chat))?.id;
  if (!dataset) { await noDataset(chat); return null; }
  if (s.busyChats.has(chat.id)) {
    await send(chat.id, '⏳ A run is already in progress in this chat. Wait for it, or press ⏹ Stop on its card.');
    return null;
  }
  s.busyChats.add(chat.id);
  try {
    await typing(chat.id);
    const launched = await launchMission({ ...opts, dataset, pace: 'cinematic', source: 'telegram' });
    s.origins.set(launched.run.id, chat.id);
    const card = s.cards.get(launched.run.id);
    if (card) { card.origin = chat.id; attach(card, chat.id); }
    const { verdict } = await launched.done;
    return verdict;
  } catch (err) {
    await send(chat.id, `❌ ${esc(err instanceof LaunchError ? err.message : errText(err))}`, [[HOME]]);
    return null;
  } finally {
    s.busyChats.delete(chat.id);
  }
}

function attach(card: RunCard, chatId: number) {
  if (card.msgs.has(chatId)) return;
  const msg = new LiveMessage(chatId, () => renderCard(card));
  card.msgs.set(chatId, msg);
  msg.touch(true);
}

function onLive(s: BotState, p: LivePayload) {
  if (p.type.startsWith('ui.')) return onUi(s, p);
  if (!p.run_id || p.source === 'script') return;
  let card = s.cards.get(p.run_id);
  if (!card) {
    card = {
      runId: p.run_id, source: p.source ?? 'dashboard', dataset: dsOf(p), mode: p.mode ?? 'ask', question: p.question ?? '',
      startedAt: Date.now(), events: 0,
      agents: Object.fromEntries(AGENTS.map((a) => [a.id, { state: 'idle' as AgentState }])) as RunCard['agents'],
      msgs: new Map(),
    };
    s.cards.set(p.run_id, card);
    const c0 = card;
    void getDataset(c0.dataset).then((d) => { if (d) { c0.dsName = d.name; c0.msgs.forEach((m) => m.touch()); } }).catch(() => {});
    const origin = s.origins.get(p.run_id);
    if (origin) card.origin = origin;
    for (const c of s.chats.values()) if (c.follow || c.id === origin) attach(card, c.id);
  }
  if (p.question && !card.question) card.question = p.question;
  card.events += 1;
  if (p.agent_id && card.agents[p.agent_id as AgentId]) {
    const a = card.agents[p.agent_id as AgentId];
    if (p.type === 'agent.task_started' || p.type === 'run.started') a.state = 'working';
    else if (p.type === 'agent.task_succeeded' || p.type === 'answer.approved' || p.type === 'answer.abstained') a.state = 'done';
    else if (p.type === 'agent.task_failed') a.state = 'failed';
    else if (a.state === 'idle') a.state = 'working';
    a.last = p.summary;
    card.latest = `${AGENTS.find((x) => x.id === p.agent_id)?.icon ?? '•'} ${p.summary}`;
  }
  if (p.type === 'run.finished' || p.type === 'run.error') {
    void finalize(s, card, p);
    return;
  }
  card.msgs.forEach((m) => m.touch());
}

async function finalize(s: BotState, card: RunCard, p: LivePayload) {
  let row: { status: string; answer: string | null; verdict: Verdict | null } | undefined;
  for (let i = 0; i < 8; i += 1) {
    const r = await db().run.findUnique({ where: { id: card.runId }, select: { status: true, answer: true, verdict: true } }).catch(() => null);
    row = r ? { status: r.status, answer: r.answer, verdict: r.verdict as Verdict | null } : undefined;
    if (row && row.status !== 'running') break;
    await sleep(400);
  }
  card.final = {
    status: row?.status ?? (p.type === 'run.error' ? 'error' : 'answered'),
    answer: row?.verdict?.answer ?? row?.answer ?? undefined,
    reason: row?.verdict?.reason,
    verdict: row?.verdict ?? null,
    error: p.type === 'run.error' ? p.summary : undefined,
  };
  for (const a of AGENTS) if (card.agents[a.id].state === 'working') card.agents[a.id].state = 'done';
  card.msgs.forEach((m) => m.touch(true));
  setTimeout(() => { s.cards.delete(card.runId); s.origins.delete(card.runId); }, 15 * 60_000);
}

/** Buttons under a finished run, shaped by what the run actually produced. */
function runButtons(runId: string, mode: string, status: string, hasSql: boolean): InlineKeyboard {
  const failed = status === 'error' || status === 'halted';
  const detail: InlineButton[] = mode === 'audit'
    ? [btn('📋 Rows before → after', `${R.result}:${runId}`), btn('📊 What changed', R.compare)]
    : [
      ...(status === 'answered' ? [btn('📋 Result table', `${R.result}:${runId}`)] : []),
      ...(hasSql ? [btn('🧾 SQL', `${R.sql}:${runId}`)] : []),
    ];
  return [
    ...(failed ? [] : [detail]),
    [btn('🔁 Run again', `${R.again}:${runId}`), btn('💬 Ask another', R.questions)],
    [HOME],
  ];
}

function renderCard(card: RunCard): { text: string; kb?: InlineKeyboard } {
  const dsName = card.dsName ?? card.dataset;
  const f = card.final;

  const lines = [
    `${DS} <b>${esc(dsName)}</b> · ${SOURCE_LABEL[card.source] ?? esc(card.source)}`,
    card.mode === 'audit' ? '🩺 <b>Data health audit</b>' : `❓ <i>${esc(clip(card.question, 220))}</i>`,
    '',
  ];
  for (const a of AGENTS) {
    const st = card.agents[a.id];
    lines.push(`${STATE_ICON[st.state]} ${a.icon} <b>${a.name}</b>${st.last ? ` · <i>${esc(clip(st.last, 70))}</i>` : st.state === 'idle' ? ' · <i>waiting</i>' : ''}`);
  }
  const done = AGENTS.filter((a) => card.agents[a.id].state === 'done').length;
  const secs = ((Date.now() - card.startedAt) / 1000).toFixed(1);
  lines.push('');
  if (!f) {
    lines.push(`<code>${'▰'.repeat(done)}${'▱'.repeat(AGENTS.length - done)}</code> ${card.events} events · ${secs}s · read-only`);
    if (card.latest) lines.push(`<i>${esc(clip(card.latest, 140))}</i>`);
    return { text: lines.join('\n'), kb: [[btn('⏹ Stop', `${R.stop}:${card.runId}`)]] };
  }

  const v = f.verdict;
  if (f.error || f.status === 'error' || f.status === 'halted') {
    lines.push(`❌ <b>${f.status === 'halted' ? 'Run stopped' : 'Run failed'}</b>${f.error ? `\n${esc(clip(f.error, 300))}` : ''}`);
  } else if (card.mode === 'audit' && v?.audit) {
    const au = v.audit;
    lines.push(
      `🩺 <b>Clarity ${au.scoreBefore} → ${au.scoreAfter}</b> (${esc(au.gradeBefore)} → ${esc(au.gradeAfter)})`,
      `${au.issues.length} problems found · ${au.fixes.length} columns cleaned · ${au.duplicatesRemoved} duplicates removed`,
      ...au.issues.filter((i) => i.severity === 'high').slice(0, 4).map((i) => `• 🔴 ${esc(clip(i.title, 90))}`),
    );
  } else if (f.status === 'abstained') {
    lines.push(`🛑 <b>Declined honestly</b>\n${esc(clip(f.reason ?? f.answer ?? '', 500))}`);
  } else {
    lines.push(`✅ <b>Verified answer</b>\n${esc(clip(f.answer ?? '', 700))}`);
    if (v) {
      const drafts = v.attempts.length;
      lines.push(`<i>✓ ${v.trust.checksPassed} checks passed${v.trust.checksWarned ? ` · ${v.trust.checksWarned} warnings` : ''} · ${drafts} SQL draft${drafts === 1 ? '' : 's'}${drafts > 1 ? ' (repaired)' : ''}${v.trust.independentlyVerified ? ' · independently recomputed' : ''}</i>`);
    }
  }
  lines.push('', `<i>${secs}s · ${card.events} events</i>`);
  return { text: lines.join('\n'), kb: runButtons(card.runId, card.mode, f.status, !!v?.sql) };
}

const runIcon = (st: string) => (st === 'answered' ? '✅' : st === 'abstained' ? '🛑' : st === 'running' ? '⏳' : '❌');

async function history(chat: Chat, editId?: number) {
  const runs = await listRuns(8);
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const lines = ['🕘 <b>Recent runs</b> · from every surface', ''];
  if (!runs.length) lines.push('<i>No runs yet. Ask a question to start one.</i>');
  runs.forEach((r) => lines.push(`${runIcon(r.status)} ${esc(clip(r.question, 60))}\n   <i>${SOURCE_LABEL[r.source ?? ''] ?? '🖥 Dashboard'} · ${time(r.started_at)}</i>`));
  await show(chat.id, lines.join('\n'), [
    ...runs.map((r) => [btn(`${runIcon(r.status)} ${clip(r.question, 44)}`, `${R.history}:${r.id}`)]),
    [btn('🔄 Refresh', R.history), HOME],
  ], editId);
}

async function loadVerdict(runId: string) {
  const { run } = await runEvents(runId);
  return run as (typeof run & { verdict?: Verdict | null }) | null;
}

async function runSummary(chat: Chat, runId: string, editId?: number) {
  const r = await loadVerdict(runId);
  if (!r) return show(chat.id, 'That run was not found.', [[btn('◀ Recent runs', R.history), HOME]], editId);
  const v = r.verdict;
  const body = v?.mode === 'audit' && v.audit
    ? `🩺 Clarity <b>${v.audit.scoreBefore} → ${v.audit.scoreAfter}</b> · ${v.audit.issues.length} problems · ${v.audit.duplicatesRemoved} duplicates removed`
    : v ? (v.status === 'answered' ? `✅ ${esc(clip(v.answer, 700))}` : `🛑 Declined: ${esc(clip(v.reason ?? v.answer, 500))}`) : `Status: <b>${esc(r.status)}</b>`;
  const kb = runButtons(runId, v?.mode ?? 'ask', v?.status ?? r.status, !!v?.sql);
  kb.splice(kb.length - 1, 1, [btn('◀ Recent runs', R.history), HOME]);
  await show(chat.id, [
    `${runIcon(v?.status ?? r.status)} <b>${esc(clip(r.question, 200))}</b>`,
    `<i>${SOURCE_LABEL[r.source ?? ''] ?? '🖥 Dashboard'}</i>`,
    '',
    body,
  ].join('\n'), kb, editId);
}

async function resultTable(chat: Chat, runId: string) {
  const r = await loadVerdict(runId);
  const v = r?.verdict;
  const back = [[btn('◀ Run', `${R.history}:${runId}`), HOME]];
  if (!v) return send(chat.id, 'No result stored for that run.', back);
  if (v.mode === 'audit' && v.audit) {
    const rows = Object.keys(v.audit.rowsBefore).map((t) => `${t.padEnd(14).slice(0, 14)} ${String(v.audit!.rowsBefore[t]).padStart(5)} → ${String(v.audit!.rowsAfter[t] ?? '').padStart(5)}`);
    return send(chat.id, `📋 <b>Rows before → after cleaning</b>\n<pre>${esc(rows.join('\n'))}</pre>`, back);
  }
  if (!v.rows.length) return send(chat.id, v.status === 'abstained' ? `🛑 No table: the agents declined.\n${esc(clip(v.reason ?? '', 400))}` : 'The result has no rows.', back);
  const cols = v.columns.slice(0, 4);
  const widths = cols.map((c, i) => Math.min(16, Math.max(c.length, ...v.rows.slice(0, 15).map((row) => String(row[i] ?? '∅').length))));
  const line = (vals: (string | number | null)[]) => vals.slice(0, cols.length).map((x, i) => clip(String(x ?? '∅'), widths[i]).padEnd(widths[i])).join('  ');
  const body = [line(cols), widths.map((w) => '─'.repeat(w)).join('  '), ...v.rows.slice(0, 15).map(line)].join('\n');
  await send(chat.id, `📋 <b>Result</b> · ${v.rowCount} row${v.rowCount === 1 ? '' : 's'}${v.rows.length > 15 ? ' (first 15)' : ''}${v.columns.length > 4 ? ` · first 4 of ${v.columns.length} columns` : ''}\n<pre>${esc(body)}</pre>`, back);
}

async function sqlOf(chat: Chat, runId: string) {
  const r = await loadVerdict(runId);
  const v = r?.verdict;
  const back = [[btn('◀ Run', `${R.history}:${runId}`), HOME]];
  if (!v?.sql) return send(chat.id, v?.status === 'abstained' ? '🛑 No SQL: the agents declined before writing a query.' : 'No SQL stored for that run.', back);
  const drafts = v.attempts.map((a) => `Draft ${a.attempt}: ${a.error ? `error (${clip(a.error, 60)})` : `${a.rowCount ?? 0} rows`}${a.failedChecks.length ? `, failed ${a.failedChecks.join(', ')}` : ''}`);
  await send(chat.id, `🧾 <b>Final SQL</b> (read-only, on the cleaned view)\n<pre>${esc(clip(v.sql, 3000))}</pre>${drafts.length ? `\n<i>${esc(drafts.join('\n'))}</i>` : ''}`, back);
}

async function again(chat: Chat, runId: string) {
  const r = await db().run.findUnique({ where: { id: runId }, select: { question: true, island: true, mode: true } }).catch(() => null);
  if (!r) return send(chat.id, 'That run was not found.', [[HOME]]);
  const ds = dsOf({ island: r.island });
  return startRun(chat, r.mode === 'audit' ? { dataset: ds, mode: 'audit' } : { dataset: ds, mode: 'ask', question: r.question });
}

// ---------------------------------------------------------------- uploads

async function onDocument(chat: Chat, m: TgMessage) {
  const d = m.document!;
  const name = d.file_name ?? 'upload.csv';
  if (!/\.(csv|tsv|txt)$/i.test(name)) return send(chat.id, '📎 Please send a <b>.csv</b> file.', [[HOME]]);
  if ((d.file_size ?? 0) > 2 * 1024 * 1024) return send(chat.id, 'That file is larger than 2 MB.', [[HOME]]);
  await tg('sendChatAction', { chat_id: chat.id, action: 'upload_document' }).catch(() => {});
  try {
    const csv = await downloadFile(d.file_id);
    const up = await storeUpload(name, csv);
    chat.dataset = up.id;
    await saveChat(chat);
    await send(chat.id, `📥 <b>${esc(name)}</b> stored: ${up.rows.toLocaleString()} rows × ${up.cols} columns, kept exactly as written.\nThe agents are auditing it now. It is now your selected dataset, and it also appears in the dashboard.`);
    await startRun(chat, { dataset: up.id, mode: 'audit' });
  } catch (err) {
    await send(chat.id, `❌ Upload failed: ${esc(errText(err))}`, [[HOME]]);
  }
}

// ---------------------------------------------------------------- game / UI activity

function onUi(s: BotState, p: LivePayload) {
  if (!p.type.startsWith('ui.game')) return;
  for (const c of s.chats.values()) {
    if (!c.follow) continue;
    let sess = s.games.get(c.id);
    if (p.type === 'ui.game.open' || !sess || sess.closed) {
      if (p.type !== 'ui.game.open' && !sess) continue;
      const fresh: GameSession = { lines: [], closed: false, startedAt: Date.now(), msg: undefined as unknown as LiveMessage };
      fresh.msg = new LiveMessage(c.id, () => renderGame(fresh));
      s.games.set(c.id, fresh);
      sess = fresh;
    }
    sess.lines.push({ at: Date.now(), text: p.summary });
    if (sess.lines.length > 12) sess.lines.splice(0, sess.lines.length - 12);
    if (p.type === 'ui.game.close') sess.closed = true;
    sess.msg.touch();
  }
}

function renderGame(sess: GameSession) {
  const t = (at: number) => `+${Math.round((at - sess.startedAt) / 1000)}s`;
  const last = sess.lines[sess.lines.length - 1];
  return {
    text: [
      `🎮 <b>Game mode</b> · Schema City ${sess.closed ? '· closed' : '· live'}`,
      '',
      ...sess.lines.map((l, i) => `${i === sess.lines.length - 1 && !sess.closed ? '⏳' : '✓'} <code>${t(l.at)}</code> ${esc(l.text)}`),
      '',
      sess.closed ? '<i>Back on the dashboard.</i>' : `<i>${esc(clip(last?.text, 80))}</i>`,
    ].join('\n'),
    kb: sess.closed ? [[HOME]] : undefined,
  };
}
