// path: lib/boot.generated.ts
// GENERATED - do not edit. Source: config/boot/sNN-*.ts (run: npm run gen)

import { boot as s01Entitlement } from '@/config/boot/s01-entitlement';
import { boot as s03EmailTemplates } from '@/config/boot/s03-email-templates';

/** Runs every boot hook in file-name order (STEP number first). */
export async function runBootHooks(): Promise<void> {
  await s01Entitlement();
  await s03EmailTemplates();
}
