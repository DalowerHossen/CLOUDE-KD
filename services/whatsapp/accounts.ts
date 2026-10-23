// path: services/whatsapp/accounts.ts
// The WhatsApp connection of a company. The access token and app secret are kept encrypted (purpose `oauth-tokens`, scoped to
// the company) and never returned. The platform makes the webhook address (a random key in the path) and the verify token (shown
// once, only its hash is kept); the owner pastes both into the Meta App Dashboard. A new account starts in sandbox mode, where
// nothing is sent to Meta.
import 'server-only';
import { randomBase62 } from '@/lib/integrations/api-key-rules';
import { siteUrl } from '@/lib/cms/site-url';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { parseMessagingLimit } from '@/lib/whatsapp/automation-rules';
import { accountInput, accountUpdate } from '@/lib/whatsapp/rules';
import { messagingLimit, phoneHealth, WhatsAppApiError } from '@/lib/whatsapp/client';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import {
  ACCOUNT_COLUMNS,
  accountRow,
  credentialsOf,
  need,
  open,
  record,
  requireAccount,
  seal,
  type AccountRow,
} from './db';

export interface AccountView {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string;
  verifiedName: string;
  qualityRating: string;
  tokenLast4: string;
  sandbox: boolean;
  status: 'active' | 'paused';
  webhookUrl: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  dailyLimit: number;
  version: number;
}

const toView = (r: AccountRow): AccountView => ({
  id: r.id,
  wabaId: r.waba_id,
  phoneNumberId: r.phone_number_id,
  displayPhone: r.display_phone,
  verifiedName: r.verified_name,
  qualityRating: r.quality_rating,
  tokenLast4: r.access_token_last4,
  sandbox: r.sandbox,
  status: r.status === 'paused' ? 'paused' : 'active',
  webhookUrl: `${siteUrl()}/api/webhooks/whatsapp/${r.webhook_key}`,
  lastCheckedAt: r.last_checked_at,
  lastError: r.last_error,
  dailyLimit: r.daily_limit,
  version: r.version,
});

const newVerifyToken = (): string => `kdv_${randomBase62(32)}`;

export async function getAccount(companyId: string): Promise<AccountView | null> {
  const row = await accountRow(companyId);
  return row ? toView(row) : null;
}

export async function connectAccount(
  actor: Actor,
  input: unknown,
): Promise<{ account: AccountView; verifyToken: string }> {
  const companyId = need(actor);
  const parsed = accountInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The account is not valid.');
  const d = parsed.data;
  if (await accountRow(companyId)) throw new ConflictError('WhatsApp is already set up.');
  const verifyToken = newVerifyToken();
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_accounts')
    .insert({
      company_id: companyId,
      waba_id: d.wabaId,
      phone_number_id: d.phoneNumberId,
      access_token_enc: await seal(companyId, d.accessToken),
      access_token_last4: d.accessToken.slice(-4),
      app_secret_enc: await seal(companyId, d.appSecret),
      webhook_key: randomBase62(32),
      verify_token_hash: await sha256Hex(verifyToken),
      sandbox: d.sandbox,
      created_by: actor.userId,
    })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const account = toView(data as unknown as AccountRow);
  await record(companyId, 'whatsapp.account_connected', 'whatsapp_account', account.id, {
    wabaId: d.wabaId,
    sandbox: d.sandbox,
  });
  return { account, verifyToken };
}

export async function updateAccount(actor: Actor, input: unknown): Promise<AccountView> {
  const companyId = need(actor);
  const parsed = accountUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await requireAccount(companyId);
  const patch: Record<string, unknown> = {};
  if (d.wabaId !== undefined) patch.waba_id = d.wabaId;
  if (d.phoneNumberId !== undefined) patch.phone_number_id = d.phoneNumberId;
  if (d.accessToken !== undefined) {
    patch.access_token_enc = await seal(companyId, d.accessToken);
    patch.access_token_last4 = d.accessToken.slice(-4);
  }
  if (d.appSecret !== undefined) patch.app_secret_enc = await seal(companyId, d.appSecret);
  if (d.sandbox !== undefined) patch.sandbox = d.sandbox;
  if (d.status !== undefined) patch.status = d.status;
  if (d.dailyLimit !== undefined) patch.daily_limit = d.dailyLimit;
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_accounts')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', current.id)
    .eq('version', d.version)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The account changed. Reload and try again.');
  await record(companyId, 'whatsapp.account_changed', 'whatsapp_account', current.id, {
    fields: Object.keys(patch).map((k) => (k.endsWith('_enc') ? `${k} (encrypted)` : k)),
  });
  return toView(await requireAccount(companyId));
}

/** A new verify token (shown once). The owner pastes it into the Meta App Dashboard next to the webhook address. */
export async function regenerateVerifyToken(actor: Actor): Promise<{ verifyToken: string }> {
  const companyId = need(actor);
  const current = await requireAccount(companyId);
  const verifyToken = newVerifyToken();
  const { error } = await getAdminSupabase()
    .from('whatsapp_accounts')
    .update({ verify_token_hash: await sha256Hex(verifyToken) })
    .eq('company_id', companyId)
    .eq('id', current.id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'whatsapp.verify_token_regenerated', 'whatsapp_account', current.id, {});
  return { verifyToken };
}

export interface HealthResult {
  ok: boolean;
  sandbox: boolean;
  message: string;
  account: AccountView;
}

/** Proves the token, the account id and the number id belong together (a live account), and stores the name and quality. */
export async function checkHealth(actor: Actor): Promise<HealthResult> {
  const companyId = need(actor);
  const row = await requireAccount(companyId);
  if (row.sandbox)
    return {
      ok: true,
      sandbox: true,
      message: 'Sandbox mode: nothing is sent to WhatsApp.',
      account: toView(row),
    };
  const admin = getAdminSupabase();
  let message = 'The connection works.';
  let ok = true;
  const patch: Record<string, unknown> = {
    last_checked_at: new Date().toISOString(),
    last_error: null,
  };
  try {
    const health = await phoneHealth(await credentialsOf(row));
    if (!health.found) {
      ok = false;
      message = 'The phone number id was not found in this WhatsApp Business Account.';
      patch.last_error = message;
    } else {
      patch.verified_name = health.verifiedName;
      patch.display_phone = health.displayPhone;
      patch.quality_rating = health.quality;
      // The limit of the business portfolio, when Meta returns it in a form we understand; otherwise the stored limit stays.
      try {
        const tier = await messagingLimit(await credentialsOf(row));
        const parsed = tier === null ? null : parseMessagingLimit(tier);
        if (parsed !== null) patch.daily_limit = parsed;
      } catch {
        message = 'The connection works, but the messaging limit could not be read.';
      }
    }
  } catch (error) {
    ok = false;
    message = error instanceof WhatsAppApiError ? error.message : 'The check failed.';
    patch.last_error = message.slice(0, 300);
  }
  const { error } = await admin.from('whatsapp_accounts').update(patch).eq('id', row.id);
  if (error) throw new InternalError(error);
  await record(companyId, 'whatsapp.health_checked', 'whatsapp_account', row.id, { ok });
  return { ok, sandbox: false, message, account: toView(await requireAccount(companyId)) };
}

export interface WebhookAccount {
  id: string;
  companyId: string;
  wabaId: string;
  phoneNumberId: string;
  verifyTokenHash: string;
  appSecret: string;
  sandbox: boolean;
}

/** The account behind a webhook address, with its app secret (for the signature check). Null for an unknown key. */
export async function accountByWebhookKey(key: string): Promise<WebhookAccount | null> {
  if (!/^[0-9A-Za-z]{32}$/.test(key)) return null;
  const { data, error } = await getAdminSupabase()
    .from('whatsapp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('webhook_key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const row = data as unknown as AccountRow;
  return {
    id: row.id,
    companyId: row.company_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    verifyTokenHash: row.verify_token_hash,
    appSecret: await open(row.company_id, row.app_secret_enc),
    sandbox: row.sandbox,
  };
}
