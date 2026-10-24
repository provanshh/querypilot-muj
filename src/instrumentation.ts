export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureWorkers } = await import('./server/agent/worker');
  void ensureWorkers();
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const { ensureBot } = await import('./server/telegram/bot');
    ensureBot();
  }
}
