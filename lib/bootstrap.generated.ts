// path: lib/bootstrap.generated.ts
// GENERATED - do not edit. Source: services/*/register.ts (run: npm run gen)

import register_approval from '@/services/approval/register';
import register_audit from '@/services/audit/register';
import register_auth from '@/services/auth/register';
import register_base from '@/services/base/register';
import register_branding from '@/services/branding/register';
import register_client from '@/services/client/register';
import register_compliance from '@/services/compliance/register';
import register_contract from '@/services/contract/register';
import register_email from '@/services/email/register';
import register_encryption from '@/services/encryption/register';
import register_entitlement from '@/services/entitlement/register';
import register_events from '@/services/events/register';
import register_fx from '@/services/fx/register';
import register_inventory from '@/services/inventory/register';
import register_invoice from '@/services/invoice/register';
import register_jobs from '@/services/jobs/register';
import register_kyc from '@/services/kyc/register';
import register_mor from '@/services/mor/register';
import register_notification from '@/services/notification/register';
import register_payment from '@/services/payment/register';
import register_payout from '@/services/payout/register';
import register_portal from '@/services/portal/register';
import register_security from '@/services/security/register';
import register_storage from '@/services/storage/register';
import register_wallet from '@/services/wallet/register';

/** Registers every service implementation in the container. Runs after the boot hooks. */
export async function bootstrapServices(): Promise<void> {
  await register_approval();
  await register_audit();
  await register_auth();
  await register_base();
  await register_branding();
  await register_client();
  await register_compliance();
  await register_contract();
  await register_email();
  await register_encryption();
  await register_entitlement();
  await register_events();
  await register_fx();
  await register_inventory();
  await register_invoice();
  await register_jobs();
  await register_kyc();
  await register_mor();
  await register_notification();
  await register_payment();
  await register_payout();
  await register_portal();
  await register_security();
  await register_storage();
  await register_wallet();
}
