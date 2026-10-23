// path: lib/boot.generated.ts
// GENERATED - do not edit. Source: config/boot/sNN-*.ts (run: npm run gen)

import { boot as s01Entitlement } from '@/config/boot/s01-entitlement';
import { boot as s03EmailTemplates } from '@/config/boot/s03-email-templates';
import { boot as s04Alerting } from '@/config/boot/s04-alerting';
import { boot as s04EmailTemplates } from '@/config/boot/s04-email-templates';
import { boot as s04Security } from '@/config/boot/s04-security';
import { boot as s04Sentry } from '@/config/boot/s04-sentry';

/** Runs every boot hook in file-name order (STEP number first). */
export async function runBootHooks(): Promise<void> {
  await s01Entitlement();
  await s03EmailTemplates();
  await s04Alerting();
  await s04EmailTemplates();
  await s04Security();
  await s04Sentry();
}
