// path: services/bankfeed/connections.ts
// The bank links of a company (Plaid and Salt Edge). The company pastes the keys of its own aggregator account; they are kept
// encrypted (purpose `oauth-tokens`, scoped to the company) and never returned. The bank itself is linked in the aggregator's own
// hosted window (Plaid Hosted Link, Salt Edge Widget): the platform makes the address and the aggregator tells the platform by
// webhook or callback. The link (Plaid access token, Salt Edge customer) is kept encrypted too.
import 'server-only';
import {
  BANKFEED_WEBHOOK_KEY_LENGTH,
  MAX_BANK_CONNECTIONS_PER_COMPANY,
  REAUTH_NOTICE_REPEAT_DAYS,
  type BankFeedProvider,
  type BankFeedStatus,
  type PlaidEnvironment,
} from '@/config/s16-bankfeed';
import { siteUrl } from '@/lib/cms/site-url';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { randomBase62 } from '@/lib/integrations/api-key-rules';
import {
  accountMap,
  bankConnect,
  bankUpdate,
  linkInput,
  mappable,
  wholeNumber,
} from '@/lib/integrations/bank-rules';
import { CommerceApiError } from '@/lib/integrations/commerce-http';
import * as plaid from '@/lib/integrations/plaid';
import * as saltedge from '@/lib/integrations/saltedge';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, open, record, seal } from './db';
import { bookAccount } from './ports';

const log = createLogger({ component: 'bankfeed' });

const COLUMNS =
  'id, company_id, provider, name, environment, secret_last4, webhook_key, link_token, external_id, institution_name, status, sync_cursor, last_synced_at, last_error, reauth_notified_at, created_by, version';

interface Row {
  id: string;
  company_id: string;
  provider: string;
  name: string;
  environment: string;
  secret_last4: string | null;
  webhook_key: string;
  link_token: string | null;
  external_id: string | null;
  institution_name: string | null;
  status: string;
  sync_cursor: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  reauth_notified_at: string | null;
  created_by: string | null;
  version: number;
}

export interface BankConnectionView {
  id: string;
  provider: BankFeedProvider;
  name: string;
  environment: PlaidEnvironment;
  status: BankFeedStatus;
  linked: boolean;
  institutionName: string | null;
  secretLast4: string | null;
  /** Plaid: the webhook address (given with each link session). Salt Edge: paste it on the Callbacks page of the dashboard. */
  webhookUrl: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  version: number;
}

export const webhookUrlOf = (provider: string, key: string): string =>
  `${siteUrl()}/api/webhooks/${provider}?k=${key}`;

const STATUSES: readonly BankFeedStatus[] = [
  'new',
  'linking',
  'active',
  'needs_reauth',
  'disconnected',
  'error',
];

const toView = (r: Row): BankConnectionView => ({
  id: r.id,
  provider: r.provider === 'saltedge' ? 'saltedge' : 'plaid',
  name: r.name,
  environment: r.environment === 'sandbox' ? 'sandbox' : 'production',
  status: STATUSES.find((s) => s === r.status) ?? 'new',
  linked: r.external_id !== null,
  institutionName: r.institution_name,
  secretLast4: r.secret_last4,
  webhookUrl: webhookUrlOf(r.provider, r.webhook_key),
  lastSyncedAt: r.last_synced_at,
  lastError: r.last_error,
  version: r.version,
});

export async function listConnections(companyId: string): Promise<BankConnectionView[]> {
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export async function getConnection(companyId: string, id: string): Promise<BankConnectionView> {
  return toView(await rowOf(companyId, id));
}

/* ---------- keys and links (decrypted, for the services only) ---------- */

interface PlaidCredentials {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
  countryCodes: string[];
}
interface SaltEdgeCredentials {
  appId: string;
  secret: string;
  privateKey?: string;
}
interface Link {
  accessToken?: string;
  customerId?: string;
}

export interface Secrets {
  row: Row;
  plaid?: PlaidCredentials;
  saltedge?: SaltEdgeCredentials;
  link: Link;
}

export async function secretsOf(companyId: string, id: string): Promise<Secrets> {
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .select(`${COLUMNS}, credentials_enc, link_enc`)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return decrypt(
    data as unknown as Row & {
      credentials_enc: EncryptedPayload;
      link_enc: EncryptedPayload | null;
    },
  );
}

async function decrypt(
  row: Row & { credentials_enc: EncryptedPayload; link_enc: EncryptedPayload | null },
): Promise<Secrets> {
  const creds = await open<PlaidCredentials & SaltEdgeCredentials>(
    row.company_id,
    row.credentials_enc,
  );
  const link = row.link_enc ? await open<Link>(row.company_id, row.link_enc) : {};
  return row.provider === 'plaid'
    ? { row, plaid: creds as PlaidCredentials, link }
    : { row, saltedge: creds as SaltEdgeCredentials, link };
}

export const plaidKeys = (s: Secrets): plaid.PlaidKeys => {
  if (!s.plaid) throw new ValidationError('This is not a Plaid link.');
  return { clientId: s.plaid.clientId, secret: s.plaid.secret, environment: s.plaid.environment };
};
export const saltedgeKeys = (s: Secrets): saltedge.SaltEdgeKeys => {
  if (!s.saltedge) throw new ValidationError('This is not a Salt Edge link.');
  return {
    appId: s.saltedge.appId,
    secret: s.saltedge.secret,
    ...(s.saltedge.privateKey ? { privateKey: s.saltedge.privateKey } : {}),
  };
};

/* ---------- connect, change, remove ---------- */

export async function connectBank(actor: Actor, input: unknown): Promise<BankConnectionView> {
  const companyId = need(actor);
  const parsed = bankConnect.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The bank link is not valid.');
  const d = parsed.data;
  if ((await listConnections(companyId)).length >= MAX_BANK_CONNECTIONS_PER_COMPANY)
    throw new ConflictError(
      `A company can have ${MAX_BANK_CONNECTIONS_PER_COMPANY} bank links at most.`,
    );
  const plaidIn = d.provider === 'plaid';
  const creds = plaidIn
    ? {
        clientId: d.clientId,
        secret: d.secret,
        environment: d.environment,
        countryCodes: d.countryCodes,
      }
    : { appId: d.appId, secret: d.secret, ...(d.privateKey ? { privateKey: d.privateKey } : {}) };
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .insert({
      company_id: companyId,
      provider: d.provider,
      name: d.name,
      environment: plaidIn ? d.environment : 'production',
      credentials_enc: await seal(companyId, creds),
      secret_last4: d.secret.slice(-4),
      webhook_key: randomBase62(BANKFEED_WEBHOOK_KEY_LENGTH),
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const view = toView(data as unknown as Row);
  await record(companyId, 'bankfeed.connected', 'bank_feed_connection', view.id, {
    provider: d.provider,
  });
  return view;
}

export async function updateConnection(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<BankConnectionView> {
  const companyId = need(actor);
  const parsed = bankUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const secrets = await secretsOf(companyId, id);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  const next = secrets.plaid
    ? {
        ...secrets.plaid,
        ...(d.clientId ? { clientId: d.clientId } : {}),
        ...(d.secret ? { secret: d.secret } : {}),
      }
    : {
        ...(secrets.saltedge as SaltEdgeCredentials),
        ...(d.appId ? { appId: d.appId } : {}),
        ...(d.secret ? { secret: d.secret } : {}),
        ...(d.privateKey ? { privateKey: d.privateKey } : {}),
      };
  if (d.clientId || d.appId || d.secret || d.privateKey) {
    patch.credentials_enc = await seal(companyId, next);
    if (d.secret) patch.secret_last4 = d.secret.slice(-4);
    patch.last_error = null;
  }
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The bank link changed. Reload and try again.');
  await record(companyId, 'bankfeed.changed', 'bank_feed_connection', id, {
    fields: Object.keys(patch).map((k) => (k.endsWith('_enc') ? `${k} (encrypted)` : k)),
  });
  return getConnection(companyId, id);
}

/**
 * Disconnects the link. Plaid: the Item is removed at Plaid (that also ends its billing). Salt Edge: the platform stops using the
 * link; removing the connection at Salt Edge is not called (the guarded transport has no DELETE, request R8), so the answer tells
 * the owner to remove it in the Salt Edge dashboard.
 */
export async function disconnect(actor: Actor, id: string): Promise<{ remoteRemoved: boolean }> {
  const companyId = need(actor);
  const secrets = await secretsOf(companyId, id);
  let remoteRemoved = false;
  if (secrets.plaid && secrets.link.accessToken) {
    try {
      await plaid.removeItem(plaidKeys(secrets), secrets.link.accessToken);
      remoteRemoved = true;
    } catch (error) {
      if (!(error instanceof CommerceApiError)) throw error;
      // A refused key or an Item that Plaid does not know any more is not a reason to keep the link.
      if (error.retryable) throw error;
    }
  }
  const { error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .update({ status: 'disconnected', link_enc: null, link_token: null, last_error: null })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'bankfeed.disconnected', 'bank_feed_connection', id, { remoteRemoved });
  return { remoteRemoved };
}

/* ---------- linking ---------- */

const returnAddress = (given: string | undefined): string => {
  const base = siteUrl();
  if (given === undefined) return `${base}/integrations/bank`;
  let url: URL;
  try {
    url = new URL(given, base);
  } catch {
    throw new ValidationError('The return address is not valid.');
  }
  // Only a page of the platform can be the place the user comes back to.
  if (url.origin !== base)
    throw new ValidationError('The return address must be a page of the platform.');
  return url.toString();
};

/** Starts the hosted window to link the bank (a new link) or to log in again (a link that needs it). Returns its address. */
export async function startLink(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<{ url: string; expiresAt: string }> {
  const companyId = need(actor);
  const parsed = linkInput.safeParse(input ?? {});
  if (!parsed.success) throw new ValidationError('The request is not valid.');
  const secrets = await secretsOf(companyId, id);
  const row = secrets.row;
  if (row.status === 'disconnected')
    throw new ConflictError('This bank link was disconnected. Make a new one.');
  const back = returnAddress(parsed.data.returnTo);
  const admin = getAdminSupabase();
  if (secrets.plaid) {
    const start = await plaid.createLink(plaidKeys(secrets), {
      userId: `kd-${row.id}`,
      webhook: webhookUrlOf('plaid', row.webhook_key),
      countryCodes: secrets.plaid.countryCodes,
      ...(secrets.link.accessToken ? { accessToken: secrets.link.accessToken } : {}),
      redirectTo: back,
    });
    const { error } = await admin
      .from('bank_feed_connections')
      .update({
        link_token: start.linkToken,
        ...(row.status === 'new' ? { status: 'linking' } : {}),
      })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) mapIntegrationError(error);
    await record(companyId, 'bankfeed.link_started', 'bank_feed_connection', id, {
      reauth: row.external_id !== null,
    });
    return { url: start.url, expiresAt: start.expiresAt };
  }
  const keys = saltedgeKeys(secrets);
  let result: saltedge.SaltEdgeLink;
  if (row.external_id !== null) {
    result = await saltedge.reconnectSession(keys, row.external_id, {
      ref: row.id,
      returnTo: back,
    });
  } else {
    let customerId = secrets.link.customerId;
    if (customerId === undefined) {
      customerId = await saltedge.createCustomer(keys, `kd-${row.id}`);
      const { error } = await admin
        .from('bank_feed_connections')
        .update({ link_enc: await seal(companyId, { ...secrets.link, customerId }) })
        .eq('company_id', companyId)
        .eq('id', id);
      if (error) mapIntegrationError(error);
    }
    result = await saltedge.connectSession(keys, { customerId, ref: row.id, returnTo: back });
    const { error } = await admin
      .from('bank_feed_connections')
      .update({ status: 'linking' })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('status', 'new');
    if (error) mapIntegrationError(error);
  }
  await record(companyId, 'bankfeed.link_started', 'bank_feed_connection', id, {
    reauth: row.external_id !== null,
  });
  return { url: result.url, expiresAt: result.expiresAt };
}

/** Writes the accounts the aggregator reported (a new one is added, a known one gets its name and currency refreshed). */
export async function saveAccounts(
  companyId: string,
  connectionId: string,
  accounts: readonly { id: string; name: string; mask: string | null; currency: string | null }[],
): Promise<void> {
  const admin = getAdminSupabase();
  for (const a of accounts) {
    const found = await admin
      .from('bank_feed_accounts')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('external_id', a.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (found.error) throw new InternalError(found.error);
    const fields = { name: a.name, mask: a.mask, currency: a.currency };
    if (found.data) {
      const { error } = await admin
        .from('bank_feed_accounts')
        .update(fields)
        .eq('company_id', companyId)
        .eq('id', String((found.data as { id: string }).id));
      if (error) mapIntegrationError(error);
    } else {
      const { error } = await admin.from('bank_feed_accounts').insert({
        company_id: companyId,
        connection_id: connectionId,
        external_id: a.id,
        ...fields,
      });
      if (error && error.code !== '23505') mapIntegrationError(error);
    }
  }
}

const activate = async (
  companyId: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> => {
  const { error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .update({ status: 'active', last_error: null, reauth_notified_at: null, ...fields })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('This bank link belongs to another company.');
    mapIntegrationError(error);
  }
};

/** Plaid: the Hosted Link session ended well and gave a public token. The link is exchanged and the accounts are read. */
export async function completePlaidLink(
  companyId: string,
  id: string,
  publicToken: string,
): Promise<void> {
  const secrets = await secretsOf(companyId, id);
  const keys = plaidKeys(secrets);
  const { accessToken, itemId } = await plaid.exchangePublicToken(keys, publicToken);
  const listing = await plaid.listAccounts(keys, accessToken);
  await activate(companyId, id, {
    external_id: itemId,
    link_enc: await seal(companyId, { ...secrets.link, accessToken }),
    link_token: null,
    sync_cursor: null,
  });
  await saveAccounts(companyId, id, listing.accounts);
  await record(companyId, 'bankfeed.linked', 'bank_feed_connection', id, {
    provider: 'plaid',
    accounts: listing.accounts.length,
  });
}

/** Salt Edge: the connection exists. It is noted, the bank name and the accounts are read. */
export async function completeSaltEdgeLink(
  companyId: string,
  id: string,
  connectionId: string,
): Promise<void> {
  const secrets = await secretsOf(companyId, id);
  const keys = saltedgeKeys(secrets);
  const shown = await saltedge.showConnection(keys, connectionId);
  const accounts = await saltedge.listAccounts(keys, connectionId);
  await activate(companyId, id, {
    external_id: connectionId,
    institution_name: shown.providerName || null,
  });
  await saveAccounts(companyId, id, accounts);
  await record(companyId, 'bankfeed.linked', 'bank_feed_connection', id, {
    provider: 'saltedge',
    accounts: accounts.length,
  });
}

/** Plaid only: reads the result of the last Hosted Link session, for when the webhook was missed (it is kept 6 hours). */
export async function finishLink(actor: Actor, id: string): Promise<{ linked: boolean }> {
  const companyId = need(actor);
  const secrets = await secretsOf(companyId, id);
  if (!secrets.plaid)
    throw new ValidationError(
      'Salt Edge tells the platform by callback. Wait a moment and reload.',
    );
  if (!secrets.row.link_token) throw new ConflictError('No link window was started.');
  const result = await plaid.readLinkResult(plaidKeys(secrets), secrets.row.link_token);
  const first = result.publicTokens[0];
  if (first === undefined) {
    if (result.finished && secrets.row.external_id !== null) {
      await activate(companyId, id, {});
      return { linked: true };
    }
    return { linked: false };
  }
  await completePlaidLink(companyId, id, first);
  return { linked: true };
}

/* ---------- accounts ---------- */

export interface FeedAccountView {
  id: string;
  connectionId: string;
  externalId: string;
  name: string;
  mask: string | null;
  currency: string | null;
  bankAccountId: string | null;
  enabled: boolean;
  lastImportedAt: string | null;
  canMap: boolean;
  version: number;
}

const ACCOUNT_COLUMNS =
  'id, connection_id, external_id, name, mask, currency, bank_account_id, enabled, last_imported_at, version';

export async function listFeedAccounts(
  companyId: string,
  connectionId: string,
): Promise<FeedAccountView[]> {
  await rowOf(companyId, connectionId);
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('company_id', companyId)
    .eq('connection_id', connectionId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    connectionId: String(r.connection_id),
    externalId: String(r.external_id),
    name: String(r.name),
    mask: r.mask === null ? null : String(r.mask),
    currency: r.currency === null ? null : String(r.currency),
    bankAccountId: r.bank_account_id === null ? null : String(r.bank_account_id),
    enabled: Boolean(r.enabled),
    lastImportedAt: r.last_imported_at === null ? null : String(r.last_imported_at),
    canMap: mappable(r.currency === null ? null : String(r.currency)),
    version: wholeNumber(r.version),
  }));
}

/** Maps an account of the bank to a bank account of the books (or removes the mapping). The first mapping fetches the history again. */
export async function mapAccount(
  actor: Actor,
  connectionId: string,
  accountId: string,
  input: unknown,
): Promise<FeedAccountView> {
  const companyId = need(actor);
  const parsed = accountMap.safeParse(input);
  if (!parsed.success) throw new ValidationError('The mapping is not valid.');
  await rowOf(companyId, connectionId);
  const accounts = await listFeedAccounts(companyId, connectionId);
  const current = accounts.find((a) => a.id === accountId);
  if (!current) throw new NotFoundError();
  const target = parsed.data.bankAccountId;
  if (target !== null) {
    if (!current.canMap) throw new ValidationError('Only USD accounts can be mapped.');
    const book = await bookAccount(companyId, target);
    if (book.status !== 'active') throw new ConflictError('The bank account is closed.');
    const taken = await getAdminSupabase()
      .from('bank_feed_accounts')
      .select('id')
      .eq('company_id', companyId)
      .eq('bank_account_id', target)
      .neq('id', accountId)
      .is('deleted_at', null)
      .limit(1);
    if (taken.error) throw new InternalError(taken.error);
    if ((taken.data ?? []).length > 0)
      throw new ConflictError('This bank account is mapped to another account already.');
  }
  const admin = getAdminSupabase();
  const { error } = await admin
    .from('bank_feed_accounts')
    .update({
      bank_account_id: target,
      enabled: parsed.data.enabled,
      // The history is fetched again for an account that gets its first mapping (lines of an unmapped account were not kept).
      ...(target !== null && current.bankAccountId === null ? { sync_cursor: null } : {}),
    })
    .eq('company_id', companyId)
    .eq('id', accountId);
  if (error) mapIntegrationError(error);
  if (target !== null && current.bankAccountId === null) {
    const reset = await admin
      .from('bank_feed_connections')
      .update({ sync_cursor: null })
      .eq('company_id', companyId)
      .eq('id', connectionId);
    if (reset.error) mapIntegrationError(reset.error);
  }
  await record(companyId, 'bankfeed.account_mapped', 'bank_feed_account', accountId, {
    mapped: target !== null,
    enabled: parsed.data.enabled,
  });
  const after = (await listFeedAccounts(companyId, connectionId)).find((a) => a.id === accountId);
  if (!after) throw new NotFoundError();
  return after;
}

/* ---------- state changes from webhooks and syncs ---------- */

/** The link needs the owner to log in again: the state is set, and the company is told once a week while it stays so. */
export async function markNeedsReauth(
  companyId: string,
  id: string,
  reason: string,
): Promise<void> {
  const row = await rowOf(companyId, id);
  if (row.status === 'disconnected') return;
  const admin = getAdminSupabase();
  const { error } = await admin
    .from('bank_feed_connections')
    .update({ status: 'needs_reauth', last_error: reason.slice(0, 300) })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  const last = row.reauth_notified_at === null ? 0 : Date.parse(row.reauth_notified_at);
  if (Date.now() - last < REAUTH_NOTICE_REPEAT_DAYS * 86_400_000) return;
  const mark = await admin
    .from('bank_feed_connections')
    .update({ reauth_notified_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', (await rowOf(companyId, id)).version);
  if (mark.error) throw new InternalError(mark.error);
  try {
    await getService('notification').notify({
      companyId,
      type: 'bankfeed.reauth',
      title: 'Log in to your bank again',
      body: `The bank link "${row.name}" needs you to log in again. Until then no new bank lines arrive.`,
      href: '/integrations/bank',
    });
  } catch (e) {
    log.error('reauth notice failed', { connectionId: id, error: e });
  }
}

export async function markError(companyId: string, id: string, message: string): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .update({ last_error: message.slice(0, 300) })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) log.error('last error not saved', { connectionId: id, code: error.code });
}

export async function markDisconnected(companyId: string, id: string): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .update({ status: 'disconnected', link_enc: null, link_token: null })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
}

/* ---------- the webhook side ---------- */

export interface WebhookBankConnection {
  id: string;
  companyId: string;
  provider: BankFeedProvider;
  status: BankFeedStatus;
  externalId: string | null;
  linkToken: string | null;
  secrets: Secrets;
}

/** The link behind a webhook address, with its keys. Null for an unknown key. */
export async function connectionByKey(key: string): Promise<WebhookBankConnection | null> {
  if (!/^[0-9A-Za-z]{32}$/.test(key)) return null;
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .select(`${COLUMNS}, credentials_enc, link_enc`)
    .eq('webhook_key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const secrets = await decrypt(
    data as unknown as Row & {
      credentials_enc: EncryptedPayload;
      link_enc: EncryptedPayload | null;
    },
  );
  const view = toView(secrets.row);
  return {
    id: secrets.row.id,
    companyId: secrets.row.company_id,
    provider: view.provider,
    status: view.status,
    externalId: secrets.row.external_id,
    linkToken: secrets.row.link_token,
    secrets,
  };
}

/** A Plaid Item (by its id) of one link, for webhooks that name the Item. */
export const itemMatches = (c: WebhookBankConnection, itemId: string): boolean =>
  c.externalId !== null && c.externalId === itemId;
