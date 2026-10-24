/** Shares non-run UI activity (e.g. the game opening) with the live feed and the Telegram bot. */
export function uiEvent(type: string, summary: string, island?: string) {
  void fetch('/api/ui', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, summary, island }),
    keepalive: true,
  }).catch(() => {});
}
