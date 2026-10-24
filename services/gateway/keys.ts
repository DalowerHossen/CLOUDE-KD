// path: services/gateway/keys.ts
// Keys of a sub-merchant. The secret is made once and shown once; only its SHA-256 hash is stored. A key has a limit per minute,
// an optional expiry and an optional list of addresses it may be used from. Unknown, revoked and expired keys look the same to the
// caller.
import 'server-only';
import { GATEWAY_MAX_KEYS_PER_SUB_MERCHANT } from '@/config/s16-gateway';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { keyInput, makeSubKey } from '@/lib/gateway/rules';
import {
  expiryFromDays,
  hashKey,
  keyState,
  maskedKey,
  rateState,
  windowStart,
  type KeyState,
  type RateState,
} from '@/lib/integrations/api-key-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';
import { getSubMerchant } from './sub-merchants';

const COLUMNS =
  'id, company_id, sub_merchant_id, name, key_prefix, last_chars, rate_limit_per_minute, allowed_ips, expires_at, revoked_at, last_used_at, created_at, version';

interface Row {
  id: string;
  company_id: string;
  sub_merchant_id: string;
  name: string;
  key_prefix: string;
  last_chars: string;
  rate_limit_per_minute: number;
  allowed_ips: string[] | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  version: number;
}

export interface SubKeyView {
  id: string;
  name: string;
  masked: string;
  rateLimitPerMinute: number;
  allowedIps: string[] | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  state: KeyState;
  version: number;
}

const toView = (r: Row, now: Date): SubKeyView => ({
  id: r.id,
  name: r.name,
  masked: maskedKey(r.key_prefix, r.last_chars),
  rateLimitPerMinute: r.rate_limit_per_minute,
  allowedIps: r.allowed_ips,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  lastUsedAt: r.last_used_at,
  createdAt: r.created_at,
  state: keyState({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now),
  version: r.version,
});

export async function listSubKeys(companyId: string, subMerchantId: string): Promise<SubKeyView[]> {
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_keys')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('sub_merchant_id', subMerchantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  const now = new Date();
  return ((data ?? []) as unknown as Row[]).map((r) => toView(r, now));
}

export async function createSubKey(
  actor: Actor,
  subMerchantId: string,
  input: unknown,
): Promise<{ key: SubKeyView; secret: string }> {
  const companyId = need(actor);
  const parsed = keyInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The key is not valid.');
  const d = parsed.data;
  const sub = await getSubMerchant(companyId, subMerchantId);
  if (sub.status !== 'active')
    throw new ConflictError('Only an active sub-merchant can get a key.');
  const existing = await listSubKeys(companyId, subMerchantId);
  if (existing.filter((k) => k.state === 'active').length >= GATEWAY_MAX_KEYS_PER_SUB_MERCHANT)
    throw new ConflictError(
      `A sub-merchant can have ${GATEWAY_MAX_KEYS_PER_SUB_MERCHANT} active keys at most.`,
    );
  const made = await makeSubKey();
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_keys')
    .insert({
      company_id: companyId,
      sub_merchant_id: subMerchantId,
      name: d.name,
      key_prefix: made.prefix,
      key_hash: made.hash,
      last_chars: made.lastChars,
      rate_limit_per_minute: d.rateLimitPerMinute,
      allowed_ips: d.allowedIps,
      expires_at: expiryFromDays(new Date(), d.expiresInDays),
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const key = toView(data as unknown as Row, new Date());
  await record(companyId, 'gateway.key_created', 'sub_merchant_key', key.id, {
    subMerchantId,
    name: d.name,
    ipRestricted: d.allowedIps !== null && d.allowedIps.length > 0,
  });
  return { key, secret: made.secret };
}

export async function revokeSubKey(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('sub_merchant_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .is('revoked_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await record(companyId, 'gateway.key_revoked', 'sub_merchant_key', id, {});
}

/** What the gateway needs to know about the key of a call and the sub-merchant behind it. */
export interface SubKeyAuth {
  keyId: string;
  companyId: string;
  subMerchantId: string;
  reference: string;
  status: 'active' | 'suspended' | 'closed';
  routeIds: string[] | null;
  rateLimitPerMinute: number;
  allowedIps: string[] | null;
  lastUsedAt: string | null;
}

/** The key behind a secret, or null when it is unknown, revoked or expired (the three look the same to the caller). */
export async function authenticateSubKey(secret: string, now: Date): Promise<SubKeyAuth | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('sub_merchant_keys')
    .select(COLUMNS)
    .eq('key_hash', await hashKey(secret))
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const r = data as unknown as Row;
  if (keyState({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now) !== 'active') return null;
  const sub = await admin
    .from('sub_merchants')
    .select('id, reference, status, route_ids')
    .eq('company_id', r.company_id)
    .eq('id', r.sub_merchant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (sub.error) throw new InternalError(sub.error);
  if (!sub.data) return null;
  const s = sub.data as {
    id: string;
    reference: string;
    status: string;
    route_ids: string[] | null;
  };
  return {
    keyId: r.id,
    companyId: r.company_id,
    subMerchantId: s.id,
    reference: s.reference,
    status: s.status === 'suspended' ? 'suspended' : s.status === 'closed' ? 'closed' : 'active',
    routeIds: s.route_ids,
    rateLimitPerMinute: r.rate_limit_per_minute,
    allowedIps: r.allowed_ips,
    lastUsedAt: r.last_used_at,
  };
}

/** Counts this call in the current minute of the key. */
export async function hitSubKey(auth: SubKeyAuth, now: Date): Promise<RateState> {
  const { data, error } = await getAdminSupabase().rpc('kd_gateway_hit', {
    p_key: auth.keyId,
    p_company: auth.companyId,
    p_window: windowStart(now),
  });
  if (error) throw new InternalError(error);
  return rateState(Number(data), auth.rateLimitPerMinute, now);
}

const MARK_EVERY_MS = 60_000;

/** The last-used mark, at most once a minute. A failure here never breaks an answer. */
export async function markSubKeyUsed(auth: SubKeyAuth, now: Date): Promise<void> {
  if (auth.lastUsedAt !== null && now.getTime() - Date.parse(auth.lastUsedAt) <= MARK_EVERY_MS)
    return;
  await getAdminSupabase()
    .from('sub_merchant_keys')
    .update({ last_used_at: now.toISOString() })
    .eq('id', auth.keyId)
    .eq('company_id', auth.companyId);
}
