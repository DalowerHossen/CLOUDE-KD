// path: config/boot/s04-sentry.ts
// Starts error reporting once per process when a DSN is configured.
import { getServerEnv } from '@/lib/env';

export async function boot(): Promise<void> {
  const env = getServerEnv();
  if (!env.SENTRY_DSN) return;
  const { initSentry } = await import('@/sentry.server.config');
  initSentry(env.SENTRY_DSN, env.NODE_ENV);
}
