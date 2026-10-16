// path: lib/bootstrap.generated.ts
// GENERATED - do not edit. Source: services/*/register.ts (run: npm run gen)

import register_approval from '@/services/approval/register';
import register_audit from '@/services/audit/register';
import register_auth from '@/services/auth/register';
import register_base from '@/services/base/register';
import register_client from '@/services/client/register';
import register_compliance from '@/services/compliance/register';
import register_email from '@/services/email/register';
import register_encryption from '@/services/encryption/register';
import register_events from '@/services/events/register';
import register_fx from '@/services/fx/register';
import register_inventory from '@/services/inventory/register';
import register_jobs from '@/services/jobs/register';
import register_kyc from '@/services/kyc/register';
import register_notification from '@/services/notification/register';
import register_security from '@/services/security/register';
import register_storage from '@/services/storage/register';

/** Registers every service implementation in the container. Runs after the boot hooks. */
export async function bootstrapServices(): Promise<void> {
  await register_approval();
  await register_audit();
  await register_auth();
  await register_base();
  await register_client();
  await register_compliance();
  await register_email();
  await register_encryption();
  await register_events();
  await register_fx();
  await register_inventory();
  await register_jobs();
  await register_kyc();
  await register_notification();
  await register_security();
  await register_storage();
}
