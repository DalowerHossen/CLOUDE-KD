// path: services/integration/connections.ts
// The stores a company connected (Shopify and WooCommerce). A store is connected by pasting its credentials; they are kept
// encrypted (purpose `oauth-tokens`, scoped to the company) and never returned. The platform makes the webhook address (a random
// key in the query) and, for WooCommerce, the webhook secret. A check reads the store with the credentials; the webhooks are
// registered at the store with the same credentials.
import 'server-only';
import { MAX_CONNECTIONS_PER_COMPANY, WEBHOOK_KEY_LENGTH } from '@/config/s16-commerce';
import { siteUrl } from '@/lib/cms/site-url';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { CommerceApiError } from '@/lib/integrations/commerce-http';
import { normaliseShopDomain, normaliseStoreUrl } from '@/lib/integrations/mapping-rules';
import { connectInput, connectionUpdate } from '@/lib/integrations/mapping-rules';
import { checkShopify, registerShopifyWebhooks } from '@/lib/integrations/shopify';
import { checkWoo, registerWooWebhooks } from '@/lib/integrations/woocommerce';
import { randomBase62 } from '@/lib/integrations/api-key-rules';
import { randomHex } from '@/lib/utils/hash';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, open, record, seal, writeLog } from './commerce-db';

const COLUMNS =
  'id, company_id, provider, name, store_url, secret_last4, webhook_key, webhook_ready, status, sync_mode, auto_client, shop_name, last_checked_at, last_synced_at, last_error, created_by, version';

interface Row {
  id: string;
  company_id: string;
  provider: string;
  name: string;
  store_url: string;
  secret_last4: string | null;
  webhook_key: string;
  webhook_ready: boolean;
  status: string;
  sync_mode: string;
  auto_client: boolean;
  shop_name: string | null;
  last_checked_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_by: string | null;
  version: number;
}

export interface ConnectionView {
  id: string;
  provider: 'shopify' | 'woocommerce';
  name: string;
  storeUrl: string;
  shopName: string | null;
  status: 'active' | 'paused' | 'needs_reconnect';
  syncMode: 'realtime' | 'hourly' | 'daily';
  autoClient: boolean;
  secretLast4: string | null;
  webhookUrl: string;
  webhookReady: boolean;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  version: number;
}

export const webhookUrlOf = (provider: string, key: string): string =>
  `${siteUrl()}/api/webhooks/${provider}?k=${key}`;

const toView = (r: Row): ConnectionView => ({
  id: r.id,
  provider: r.provider === 'woocommerce' ? 'woocommerce' : 'shopify',
  name: r.name,
  storeUrl: r.store_url,
  shopName: r.shop_name,
  status:
    r.status === 'paused'
      ? 'paused'
      : r.status === 'needs_reconnect'
        ? 'needs_reconnect'
        : 'active',
  syncMode: r.sync_mode === 'hourly' ? 'hourly' : r.sync_mode === 'daily' ? 'daily' : 'realtime',
  autoClient: r.auto_client,
  secretLast4: r.secret_last4,
  webhookUrl: webhookUrlOf(r.provider, r.webhook_key),
  webhookReady: r.webhook_ready,
  lastCheckedAt: r.last_checked_at,
  lastSyncedAt: r.last_synced_at,
  lastError: r.last_error,
  version: r.version,
});

export async function listConnections(companyId: string): Promise<ConnectionView[]> {
  const { data, error } = await getAdminSupabase()
    .from('integrations')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('integrations')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export async function getConnection(companyId: string, id: string): Promise<ConnectionView> {
  return toView(await rowOf(companyId, id));
}

/** The credentials a store call needs, decrypted. For the sync code only; no route returns them. */
interface Credentials {
  accessToken?: string;
  clientSecret?: string;
  consumerKey?: string;
  consumerSecret?: string;
  webhookSecret?: string;
}
async function credentialsOf(
  companyId: string,
  id: string,
): Promise<{ row: Row; creds: Credentials }> {
  const { data, error } = await getAdminSupabase()
    .from('integrations')
    .select(`${COLUMNS}, credentials_enc`)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const full = data as unknown as Row & { credentials_enc: EncryptedPayload };
  return {
    row: full,
    creds: JSON.parse(await open(companyId, full.credentials_enc)) as Credentials,
  };
}

export async function connectStore(actor: Actor, input: unknown): Promise<ConnectionView> {
  const companyId = need(actor);
  const parsed = connectInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The store is not valid.');
  const d = parsed.data;
  if ((await listConnections(companyId)).length >= MAX_CONNECTIONS_PER_COMPANY)
    throw new ConflictError(`A company can connect ${MAX_CONNECTIONS_PER_COMPANY} stores at most.`);
  const shopify = d.provider === 'shopify';
  const storeUrl = shopify ? normaliseShopDomain(d.shopDomain) : normaliseStoreUrl(d.storeUrl);
  if (storeUrl === null) throw new ValidationError('The store address is not valid.');
  const creds: Credentials = shopify
    ? { accessToken: d.accessToken, clientSecret: d.clientSecret }
    : {
        consumerKey: d.consumerKey,
        consumerSecret: d.consumerSecret,
        webhookSecret: randomHex(24),
      };
  const last4 = shopify ? d.accessToken.slice(-4) : d.consumerKey.slice(-4);
  const { data, error } = await getAdminSupabase()
    .from('integrations')
    .insert({
      company_id: companyId,
      provider: d.provider,
      name: d.name,
      store_url: storeUrl,
      credentials_enc: await seal(companyId, JSON.stringify(creds)),
      secret_last4: last4,
      webhook_key: randomBase62(WEBHOOK_KEY_LENGTH),
      sync_mode: d.syncMode,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('This store is already connected.');
    mapIntegrationError(error);
  }
  const view = toView(data as unknown as Row);
  await record(companyId, 'commerce.store_connected', 'integration', view.id, {
    provider: d.provider,
    store: storeUrl,
  });
  await writeLog(companyId, view.id, null, 'connect', 'info', `Connected ${storeUrl}.`);
  return view;
}

export async function updateConnection(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ConnectionView> {
  const companyId = need(actor);
  const parsed = connectionUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const { row, creds } = await credentialsOf(companyId, id);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.status !== undefined) patch.status = d.status;
  if (d.syncMode !== undefined) patch.sync_mode = d.syncMode;
  if (d.autoClient !== undefined) patch.auto_client = d.autoClient;
  const next: Credentials = { ...creds };
  if (row.provider === 'shopify') {
    if (d.accessToken !== undefined) next.accessToken = d.accessToken;
    if (d.clientSecret !== undefined) next.clientSecret = d.clientSecret;
    if (d.accessToken !== undefined) patch.secret_last4 = d.accessToken.slice(-4);
  } else {
    if (d.consumerKey !== undefined) {
      next.consumerKey = d.consumerKey;
      patch.secret_last4 = d.consumerKey.slice(-4);
    }
    if (d.consumerSecret !== undefined) next.consumerSecret = d.consumerSecret;
  }
  if (JSON.stringify(next) !== JSON.stringify(creds)) {
    patch.credentials_enc = await seal(companyId, JSON.stringify(next));
    // New credentials end the "connect again" state.
    patch.status = d.status ?? 'active';
    patch.last_error = null;
  }
  const { data, error } = await getAdminSupabase()
    .from('integrations')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The store changed. Reload and try again.');
  await record(companyId, 'commerce.store_changed', 'integration', id, {
    fields: Object.keys(patch).map((k) => (k.endsWith('_enc') ? `${k} (encrypted)` : k)),
  });
  return getConnection(companyId, id);
}

export async function removeConnection(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await rowOf(companyId, id);
  const { error } = await getAdminSupabase()
    .from('integrations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'commerce.store_disconnected', 'integration', id, {});
}

const noteFailure = async (
  companyId: string,
  id: string,
  error: CommerceApiError,
): Promise<void> => {
  await getAdminSupabase()
    .from('integrations')
    .update({
      last_error: error.message.slice(0, 300),
      last_checked_at: new Date().toISOString(),
      ...(error.authRefused ? { status: 'needs_reconnect' } : {}),
    })
    .eq('company_id', companyId)
    .eq('id', id);
  await writeLog(companyId, id, null, 'check', 'error', error.message);
};

/** Reads the store with the credentials, notes its name, and marks the store "connect again" when the credentials are refused. */
export async function checkConnection(
  actor: Actor,
  id: string,
): Promise<{ ok: boolean; name: string; message: string }> {
  const companyId = need(actor);
  const { row, creds } = await credentialsOf(companyId, id);
  try {
    const name =
      row.provider === 'shopify'
        ? (
            await checkShopify({
              shopDomain: row.store_url,
              accessToken: creds.accessToken ?? '',
            })
          ).name
        : (
            await checkWoo({
              storeUrl: row.store_url,
              consumerKey: creds.consumerKey ?? '',
              consumerSecret: creds.consumerSecret ?? '',
            })
          ).name;
    await getAdminSupabase()
      .from('integrations')
      .update({ shop_name: name, last_error: null, last_checked_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id);
    await writeLog(companyId, id, null, 'check', 'info', `The store answered (${name}).`);
    return { ok: true, name, message: '' };
  } catch (error) {
    if (!(error instanceof CommerceApiError)) throw error;
    await noteFailure(companyId, id, error);
    return { ok: false, name: '', message: error.message };
  }
}

/** Registers the webhooks of the platform at the store. */
export async function registerWebhooks(
  actor: Actor,
  id: string,
): Promise<{ ok: boolean; topics: string[]; message: string }> {
  const companyId = need(actor);
  const { row, creds } = await credentialsOf(companyId, id);
  const url = webhookUrlOf(row.provider, row.webhook_key);
  try {
    const topics =
      row.provider === 'shopify'
        ? await registerShopifyWebhooks(
            { shopDomain: row.store_url, accessToken: creds.accessToken ?? '' },
            url,
          )
        : await registerWooWebhooks(
            {
              storeUrl: row.store_url,
              consumerKey: creds.consumerKey ?? '',
              consumerSecret: creds.consumerSecret ?? '',
            },
            url,
            creds.webhookSecret ?? '',
          );
    await getAdminSupabase()
      .from('integrations')
      .update({ webhook_ready: true, last_error: null })
      .eq('company_id', companyId)
      .eq('id', id);
    await record(companyId, 'commerce.webhooks_registered', 'integration', id, { topics });
    await writeLog(
      companyId,
      id,
      null,
      'webhook',
      'info',
      `Webhooks registered: ${topics.join(', ')}.`,
    );
    return { ok: true, topics, message: '' };
  } catch (error) {
    if (!(error instanceof CommerceApiError)) throw error;
    await noteFailure(companyId, id, error);
    return { ok: false, topics: [], message: error.message };
  }
}

/* ---------- the webhook side ---------- */

export interface WebhookConnection {
  id: string;
  companyId: string;
  provider: 'shopify' | 'woocommerce';
  storeUrl: string;
  status: string;
  syncMode: 'realtime' | 'hourly' | 'daily';
  autoClient: boolean;
  createdBy: string | null;
  /** The secret that signs the deliveries: the app client secret (Shopify) or our webhook secret (WooCommerce). */
  secret: string;
}

/** The store behind a webhook address, with its signing secret. Null for an unknown key. */
export async function connectionByKey(key: string): Promise<WebhookConnection | null> {
  if (!/^[0-9A-Za-z]{32}$/.test(key)) return null;
  const { data, error } = await getAdminSupabase()
    .from('integrations')
    .select(`${COLUMNS}, credentials_enc`)
    .eq('webhook_key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const row = data as unknown as Row & { credentials_enc: EncryptedPayload };
  const creds = JSON.parse(await open(row.company_id, row.credentials_enc)) as Credentials;
  const shopify = row.provider === 'shopify';
  return {
    id: row.id,
    companyId: row.company_id,
    provider: shopify ? 'shopify' : 'woocommerce',
    storeUrl: row.store_url,
    status: row.status,
    syncMode: toView(row).syncMode,
    autoClient: row.auto_client,
    createdBy: row.created_by,
    secret: (shopify ? creds.clientSecret : creds.webhookSecret) ?? '',
  };
}

/** A connection by id for the sync code (no secrets). */
export async function connectionRow(
  companyId: string,
  id: string,
): Promise<
  Pick<WebhookConnection, 'id' | 'companyId' | 'status' | 'syncMode' | 'autoClient' | 'createdBy'>
> {
  const r = await rowOf(companyId, id);
  return {
    id: r.id,
    companyId: r.company_id,
    status: r.status,
    syncMode: toView(r).syncMode,
    autoClient: r.auto_client,
    createdBy: r.created_by,
  };
}
