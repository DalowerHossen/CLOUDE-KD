// path: lib/bootstrap.generated.ts
// GENERATED - do not edit. Source: services/*/register.ts (run: npm run gen)

import register_approval from '@/services/approval/register';
import register_audit from '@/services/audit/register';
import register_base from '@/services/base/register';

/** Registers every service implementation in the container. Runs after the boot hooks. */
export async function bootstrapServices(): Promise<void> {
  await register_approval();
  await register_audit();
  await register_base();
}
