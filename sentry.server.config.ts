// path: sentry.server.config.ts
// Error reporting for the Node.js runtime. Loaded at start-up by config/boot/s04-sentry.ts when SENTRY_DSN is set.
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/security/sentry-scrub';

export function initSentry(dsn: string, environment: string): void {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
  });
}
