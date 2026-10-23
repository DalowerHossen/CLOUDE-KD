// path: services/social/accounts.ts
// Connected social accounts. A network account is connected by pasting an access token and the id the network shows (the page id,
// the Instagram account id or the Threads user id); the token is kept encrypted and never returned. The sandbox account needs
// no token. The connection can be checked with a cheap read of the network, which also notes the name it shows.
import 'server-only';
import { MAX_ACCOUNTS_PER_COMPANY, type SocialProvider } from '@/config/s16-social';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { adapterFor } from '@/lib/social/registry';
import { SocialApiError } from '@/lib/social/graph';
import { accountInput, accountUpdate } from '@/lib/social/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, open, record, seal } from './db';

const COLUMNS =
  'id, provider, display_name, external_id, token_last4, token_expires_at, status, last_error, last_checked_at, max_posts_per_day, version, created_at';

interface Row {
  id: string;
  provider: string;
  display_name: string;
  external_id: string;
  token_last4: string | null;
  token_expires_at: string | null;
  status: string;
  last_error: string | null;
  last_checked_at: string | null;
  max_posts_per_day: number | null;
  version: number;
  created_at: string;
}

export interface SocialAccountView {
  id: string;
  provider: SocialProvider;
  displayName: string;
  externalId: string;
  tokenLast4: string | null;
  tokenExpiresAt: string | null;
  status: 'active' | 'paused' | 'needs_reconnect';
  lastError: string | null;
  lastCheckedAt: string | null;
  maxPostsPerDay: number | null;
  version: number;
}

const PROVIDERS: readonly SocialProvider[] = ['facebook', 'instagram', 'threads', 'sandbox'];
const toView = (r: Row): SocialAccountView => ({
  id: r.id,
  provider: PROVIDERS.find((p) => p === r.provider) ?? 'sandbox',
  displayName: r.display_name,
  externalId: r.external_id,
  tokenLast4: r.token_last4,
  tokenExpiresAt: r.token_expires_at,
  status:
    r.status === 'paused'
      ? 'paused'
      : r.status === 'needs_reconnect'
        ? 'needs_reconnect'
        : 'active',
  lastError: r.last_error,
  lastCheckedAt: r.last_checked_at,
  maxPostsPerDay: r.max_posts_per_day,
  version: r.version,
});

const expiry = (days: number | null): string | null =>
  days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();

export async function listAccounts(companyId: string): Promise<SocialAccountView[]> {
  const { data, error } = await getAdminSupabase()
    .from('social_accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function getAccount(companyId: string, id: string): Promise<SocialAccountView> {
  const { data, error } = await getAdminSupabase()
    .from('social_accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

export async function connectAccount(actor: Actor, input: unknown): Promise<SocialAccountView> {
  const companyId = need(actor);
  const parsed = accountInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The account is not valid.');
  const d = parsed.data;
  if ((await listAccounts(companyId)).length >= MAX_ACCOUNTS_PER_COMPANY)
    throw new ConflictError(`A company can connect ${MAX_ACCOUNTS_PER_COMPANY} accounts at most.`);
  const { data, error } = await getAdminSupabase()
    .from('social_accounts')
    .insert({
      company_id: companyId,
      provider: d.provider,
      display_name: d.displayName,
      external_id: d.externalId,
      access_token_enc: d.accessToken ? await seal(companyId, d.accessToken) : null,
      token_last4: d.accessToken ? d.accessToken.slice(-4) : null,
      token_expires_at: expiry(d.tokenExpiresInDays),
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('This account is already connected.');
    mapIntegrationError(error);
  }
  const view = toView(data as unknown as Row);
  await record(companyId, 'social.account_connected', 'social_account', view.id, {
    provider: d.provider,
    externalId: d.externalId,
  });
  return view;
}

export async function updateAccount(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<SocialAccountView> {
  const companyId = need(actor);
  const parsed = accountUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await getAccount(companyId, id);
  const patch: Record<string, unknown> = {};
  if (d.displayName !== undefined) patch.display_name = d.displayName;
  if (d.accessToken !== undefined) {
    if (current.provider === 'sandbox')
      throw new ValidationError('A sandbox account has no token.');
    patch.access_token_enc = await seal(companyId, d.accessToken);
    patch.token_last4 = d.accessToken.slice(-4);
    // A new token ends the "reconnect" state.
    patch.status = d.status ?? 'active';
    patch.last_error = null;
  }
  if (d.tokenExpiresInDays !== undefined) patch.token_expires_at = expiry(d.tokenExpiresInDays);
  if (d.status !== undefined) patch.status = d.status;
  if (d.maxPostsPerDay !== undefined) patch.max_posts_per_day = d.maxPostsPerDay;
  const { data, error } = await getAdminSupabase()
    .from('social_accounts')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The account changed. Reload and try again.');
  await record(companyId, 'social.account_changed', 'social_account', id, {
    fields: Object.keys(patch).map((k) => (k.endsWith('_enc') ? `${k} (encrypted)` : k)),
  });
  return getAccount(companyId, id);
}

export async function removeAccount(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await getAccount(companyId, id);
  const admin = getAdminSupabase();
  const open = await admin
    .from('social_posts')
    .update({ status: 'cancelled' })
    .eq('company_id', companyId)
    .eq('account_id', id)
    .in('status', ['draft', 'scheduled']);
  if (open.error) mapIntegrationError(open.error);
  const { error } = await admin
    .from('social_accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'social.account_removed', 'social_account', id, {});
}

/** The decrypted token, for the publishing code only. Not exposed by any route. */
export async function tokenOf(
  companyId: string,
  id: string,
): Promise<{ provider: SocialProvider; externalId: string; token: string; status: string }> {
  const { data, error } = await getAdminSupabase()
    .from('social_accounts')
    .select('provider, external_id, access_token_enc, status')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const provider = PROVIDERS.find((p) => p === data.provider) ?? 'sandbox';
  const enc = data.access_token_enc as EncryptedPayload | null;
  return {
    provider,
    externalId: String(data.external_id),
    token: enc ? await open(companyId, enc) : '',
    status: String(data.status),
  };
}

/** Asks the network for the name of the account (a cheap read). A failure marks the account for reconnecting. */
export async function checkAccount(
  actor: Actor,
  id: string,
): Promise<{ ok: boolean; message: string; account: SocialAccountView }> {
  const companyId = need(actor);
  const t = await tokenOf(companyId, id);
  const adapter = adapterFor(t.provider);
  let ok = true;
  let message = 'The connection works.';
  const patch: Record<string, unknown> = {
    last_checked_at: new Date().toISOString(),
    last_error: null,
  };
  if (!adapter.check) {
    message =
      t.provider === 'sandbox'
        ? 'Sandbox account: nothing is sent to a network.'
        : 'This network has no connection check; the first post will show if it works.';
  } else {
    try {
      const r = await adapter.check({
        provider: t.provider,
        externalId: t.externalId,
        token: t.token,
      });
      message = r.name === '' ? message : `The connection works (${r.name}).`;
    } catch (error) {
      ok = false;
      message = error instanceof SocialApiError ? error.message : 'The check failed.';
      patch.last_error = message.slice(0, 300);
      if (error instanceof SocialApiError && !error.retryable) patch.status = 'needs_reconnect';
    }
  }
  const { error } = await getAdminSupabase().from('social_accounts').update(patch).eq('id', id);
  if (error) throw new InternalError(error);
  await record(companyId, 'social.account_checked', 'social_account', id, { ok });
  return { ok, message, account: await getAccount(companyId, id) };
}
