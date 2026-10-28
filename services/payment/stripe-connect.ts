// path: services/payment/stripe-connect.ts
// Stripe onboarding of companies (docs/processors/stripe.md section 13): a connected account per company, Stripe's hosted onboarding
// link, the check that card payments are active, and the webhook endpoints at Stripe. The connected account is saved as the
// company's account at Stripe (S16_040); payments of that company are then made on it with the platform's keys.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import { STRIPE_EVENT_TYPES } from '@/lib/payment/adapters/stripe/webhook';
import {
  CONNECTED_ACCOUNT_ID,
  cardPaymentsStatus,
  createConnectedAccount,
  createOnboardingLink,
  createWebhookEndpoint,
} from '@/lib/payment/onboarding/stripe-connect';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { saveAccount } from './company-accounts';
import { getProcessorRow, loadCurrentCredentials, saveCredentials } from './credential-store';

const PROCESSOR = 'stripe';

function requireSuperAdmin(actor: Actor): void {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
}

const appUrl = (): string => getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');

/** The platform's Stripe secret key, and the environment it must belong to (a test key for the sandbox). */
async function platformKey(): Promise<{ secretKey: string; environment: 'sandbox' | 'live' }> {
  const processor = await getProcessorRow(PROCESSOR);
  const { values } = await loadCurrentCredentials(PROCESSOR);
  const secretKey = values.secretKey ?? '';
  if (secretKey === '')
    throw new ValidationError('Save the Stripe secret key first (Payment processors, Stripe).');
  const mode = /^(sk|rk)_test_/.test(secretKey) ? 'sandbox' : 'live';
  if (mode !== processor.environment)
    throw new ValidationError('The Stripe key does not belong to the selected environment.');
  return { secretKey, environment: processor.environment };
}

/** Creates a Stripe connected account for a company and saves it as the company's account (switched off until tested). */
export async function createCompanyAccount(
  actor: Actor,
  input: { companyId: string; email: string; displayName: string; country: string },
): Promise<{ accountId: string; id: string }> {
  requireSuperAdmin(actor);
  const key = await platformKey();
  const accountId = await createConnectedAccount(key.secretKey, input);
  const saved = await saveAccount(actor, {
    companyId: input.companyId,
    processorId: PROCESSOR,
    environment: key.environment,
    values: { connectedAccountId: accountId },
    merchantReference: accountId,
  });
  return { accountId, id: saved.id };
}

async function connectedIdOf(
  accountRowId: string,
): Promise<{ accountId: string; companyId: string }> {
  const { data, error } = await getAdminSupabase()
    .from('company_processor_accounts')
    .select('company_id, processor_id, merchant_reference')
    .eq('id', accountRowId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.processor_id !== PROCESSOR) throw new NotFoundError();
  const accountId = String(data.merchant_reference ?? '');
  if (!CONNECTED_ACCOUNT_ID.test(accountId))
    throw new ValidationError('This account has no Stripe account id.');
  return { accountId, companyId: String(data.company_id) };
}

/**
 * A single-use link to Stripe's hosted onboarding. Stripe's guidance: authenticate the account holder in the platform before
 * redirecting, and never send the link by e-mail or text.
 */
export async function onboardingLinkFor(actor: Actor, accountRowId: string): Promise<string> {
  requireSuperAdmin(actor);
  const key = await platformKey();
  const { accountId, companyId } = await connectedIdOf(accountRowId);
  const back = `${appUrl()}/admin/processors/accounts`;
  const url = await createOnboardingLink(key.secretKey, {
    accountId,
    returnUrl: back,
    refreshUrl: back,
  });
  await getService('audit').record({
    action: 'company_processor_account.onboarding_link',
    resourceType: 'company_processor_account',
    resourceId: accountRowId,
    companyId,
    metadata: { by: actor.userId, processor: PROCESSOR },
  });
  return url;
}

/** For the connection test of a Stripe company account: card payments must be active on the connected account. */
export async function connectedAccountReady(
  accountRowId: string,
): Promise<{ ok: boolean; message: string }> {
  const key = await platformKey();
  const { accountId } = await connectedIdOf(accountRowId);
  const status = await cardPaymentsStatus(key.secretKey, accountId);
  return status === 'active'
    ? { ok: true, message: 'Card payments are active on the connected account.' }
    : {
        ok: false,
        message: `Stripe has not activated card payments for this account yet (state: ${status}). The merchant must finish Stripe's onboarding.`,
      };
}

/**
 * Creates the webhook endpoints at Stripe (one for the platform's own account, one for connected accounts) and saves their signing
 * secrets with the Stripe credentials. Saving credentials switches the processor off until it is tested and enabled again.
 */
export async function registerWebhooks(actor: Actor): Promise<{ url: string; saved: string[] }> {
  requireSuperAdmin(actor);
  const key = await platformKey();
  const current = await loadCurrentCredentials(PROCESSOR);
  const url = `${appUrl()}/api/webhooks/${PROCESSOR}`;
  const own = await createWebhookEndpoint(key.secretKey, {
    url,
    events: STRIPE_EVENT_TYPES,
    connect: false,
    description: 'KD SOLUTION IT payments',
  });
  let connect: { id: string; secret: string } | null = null;
  try {
    connect = await createWebhookEndpoint(key.secretKey, {
      url,
      events: STRIPE_EVENT_TYPES,
      connect: true,
      description: 'KD SOLUTION IT payments of connected accounts',
    });
  } catch (error) {
    // The platform may not be a Connect platform yet: the platform's own endpoint stands, and the message says so.
    if (!(error instanceof ValidationError)) throw error;
  }
  const values = {
    ...current.values,
    webhookSecret: own.secret,
    ...(connect ? { connectWebhookSecret: connect.secret } : {}),
  };
  await saveCredentials({
    processorId: PROCESSOR,
    values,
    actorId: actor.userId,
    expectedVersion: null,
  });
  await getService('audit').record({
    action: 'processor.webhooks_created',
    resourceType: 'processor',
    resourceId: null,
    companyId: null,
    metadata: { by: actor.userId, processor: PROCESSOR, endpoints: connect ? 2 : 1 },
  });
  if (!connect && current.values.connectWebhookSecret === undefined)
    throw new ConflictError(
      'The webhook for the platform account was created and saved. The webhook for connected accounts could not be created (is the platform registered for Connect?). Test and enable Stripe again.',
    );
  return { url, saved: connect ? ['webhookSecret', 'connectWebhookSecret'] : ['webhookSecret'] };
}
