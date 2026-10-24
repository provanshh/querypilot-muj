/** Minimal Telegram Bot API client. The token never leaves the server. */

export interface InlineButton { text: string; callback_data?: string; url?: string }
export type InlineKeyboard = InlineButton[][];

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
}
export interface TgCallback { id: string; from: { id: number }; message?: TgMessage; data?: string }
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallback }

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME?.trim() || 'querypilot01_bot';

export class TgError extends Error {
  constructor(message: string, public code: number, public retryAfter?: number) { super(message); }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const token = botToken();
  if (!token) throw new TgError('TELEGRAM_BOT_TOKEN is not set', 0);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const j = (await res.json().catch(() => ({}))) as { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
  if (!j.ok) throw new TgError(j.description ?? `Telegram ${method} failed`, j.error_code ?? res.status, j.parameters?.retry_after);
  return j.result as T;
}

export async function downloadFile(fileId: string): Promise<string> {
  const f = await tg<{ file_path: string }>('getFile', { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${botToken()}/${f.file_path}`);
  if (!res.ok) throw new Error('Could not download the file from Telegram.');
  return res.text();
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
