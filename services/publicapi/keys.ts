// path: services/publicapi/keys.ts
// API keys of a company. The secret is made once and shown once; only its SHA-256 hash is stored. A key has scopes, a mode (live
// or sandbox), an optional expiry and a limit per minute. Rotation makes a new key with the same name, scopes and limit and lets
// the old key work for a short overlap. Every change is audited; nothing returned to the owner contains a secret except the answer
// that makes a key.
import 'server-only';
import { MAX_KEYS_PER_COMPANY } from '@/config/s16-api';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  expiryFromDays,
  hashKey,
  keyInput,
  keyState,
  keyUpdate,
  makeKey,
  maskedKey,
  oldKeyExpiry,
  rotateInput,
  type KeyMode,
  type KeyState,
} from '@/lib/integrations/api-key-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from './db-errors';
import { seedSandbox } from './sandbox';

const COLUMNS =
  'id, company_id, name, key_prefix, key_hash, last_chars, mode, scopes, rate_limit_per_minute, expires_at, revoked_at, rotated_from, created_at, last_used_at, last_used_ip, version';

interface Row {
  id: string;
  company_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  last_chars: string;
  mode: string;
  scopes: string[];
  rate_limit_per_minute: number;
  expires_at: string | null;
  revoked_at: string | null;
  rotated_from: string | null;
  created_at: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  version: number;
}

export interface KeyView {
  id: string;
  name: string;
  masked: string;
  mode: KeyMode;
  scopes: string[];
  rateLimitPerMinute: number;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFrom: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  state: KeyState;
  version: number;
}

/** What the public API needs to know about the key that made a call. */
export interface KeyAuth {
  id: string;
  companyId: string;
  mode: KeyMode;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
}

const toView = (r: Row, now: Date): KeyView => ({
  id: r.id,
  name: r.name,
  masked: maskedKey(r.key_prefix, r.last_chars),
  mode: r.mode === 'sandbox' ? 'sandbox' : 'live',
  scopes: r.scopes,
  rateLimitPerMinute: r.rate_limit_per_minute,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  rotatedFrom: r.rotated_from,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  lastUsedIp: r.last_used_ip,
  state: keyState({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now),
  version: r.version,
});

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function record(
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'api_key',
    resourceId: id,
    companyId,
    metadata,
  });
}

export async function listKeys(companyId: string): Promise<KeyView[]> {
  const { data, error } = await getAdminSupabase()
    .from('api_keys')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  const now = new Date();
  return ((data ?? []) as unknown as Row[]).map((r) => toView(r, now));
}

async function getRow(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('api_keys')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export async function getKey(companyId: string, id: string): Promise<KeyView> {
  return toView(await getRow(companyId, id), new Date());
}

async function insertKey(
  companyId: string,
  createdBy: string | null,
  v: {
    name: string;
    mode: KeyMode;
    scopes: string[];
    rateLimitPerMinute: number;
    expiresAt: string | null;
    rotatedFrom: string | null;
  },
): Promise<{ view: KeyView; secret: string }> {
  const made = await makeKey(v.mode);
  const { data, error } = await getAdminSupabase()
    .from('api_keys')
    .insert({
      company_id: companyId,
      name: v.name,
      key_prefix: made.prefix,
      key_hash: made.hash,
      last_chars: made.lastChars,
      mode: v.mode,
      scopes: v.scopes,
      rate_limit_per_minute: v.rateLimitPerMinute,
      expires_at: v.expiresAt,
      rotated_from: v.rotatedFrom,
      created_by: createdBy,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  return { view: toView(data as unknown as Row, new Date()), secret: made.secret };
}

export async function createKey(
  actor: Actor,
  input: unknown,
): Promise<{ key: KeyView; secret: string }> {
  const companyId = need(actor);
  const parsed = keyInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The key is not valid.');
  const d = parsed.data;
  const live = await listKeys(companyId);
  if (live.filter((k) => k.state === 'active').length >= MAX_KEYS_PER_COMPANY)
    throw new ConflictError(`A company can have ${MAX_KEYS_PER_COMPANY} active keys at most.`);
  const made = await insertKey(companyId, actor.userId, {
    name: d.name,
    mode: d.mode,
    scopes: d.scopes,
    rateLimitPerMinute: d.rateLimitPerMinute,
    expiresAt: expiryFromDays(new Date(), d.expiresInDays),
    rotatedFrom: null,
  });
  if (d.mode === 'sandbox') await seedSandbox(companyId);
  await record(companyId, 'api_key.created', made.view.id, {
    name: d.name,
    mode: d.mode,
    scopes: d.scopes,
  });
  return { key: made.view, secret: made.secret };
}

export async function updateKey(actor: Actor, id: string, input: unknown): Promise<KeyView> {
  const companyId = need(actor);
  const parsed = keyUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.scopes !== undefined) patch.scopes = d.scopes;
  if (d.rateLimitPerMinute !== undefined) patch.rate_limit_per_minute = d.rateLimitPerMinute;
  const current = await getRow(companyId, id);
  if (current.revoked_at !== null) throw new ConflictError('A revoked key cannot be changed.');
  const { data, error } = await getAdminSupabase()
    .from('api_keys')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The key changed or was removed. Reload and try again.');
  await record(companyId, 'api_key.changed', id, { fields: Object.keys(patch) });
  return getKey(companyId, id);
}

export async function revokeKey(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const current = await getRow(companyId, id);
  if (current.revoked_at !== null) return;
  const { error } = await getAdminSupabase()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'api_key.revoked', id, {});
}

/** A new key with the same name, scopes, mode and limit; the old key stops working after the overlap (never later than its own expiry). */
export async function rotateKey(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<{ key: KeyView; secret: string; oldKeyExpiresAt: string }> {
  const companyId = need(actor);
  const parsed = rotateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The overlap is not valid.');
  const old = await getRow(companyId, id);
  if (keyState({ expiresAt: old.expires_at, revokedAt: old.revoked_at }, new Date()) !== 'active')
    throw new ConflictError('Only an active key can be rotated.');
  const replacedBy = await listKeys(companyId);
  if (replacedBy.some((k) => k.rotatedFrom === id && k.state === 'active'))
    throw new ConflictError('This key was already rotated. Revoke the new key first.');
  const stop = oldKeyExpiry(new Date(), parsed.data.overlapHours, old.expires_at);
  const made = await insertKey(companyId, actor.userId, {
    name: old.name,
    mode: old.mode === 'sandbox' ? 'sandbox' : 'live',
    scopes: old.scopes,
    rateLimitPerMinute: old.rate_limit_per_minute,
    expiresAt: old.expires_at,
    rotatedFrom: id,
  });
  const { error } = await getAdminSupabase()
    .from('api_keys')
    .update({ expires_at: stop })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'api_key.rotated', id, { newKeyId: made.view.id, oldKeyExpiresAt: stop });
  return { key: made.view, secret: made.secret, oldKeyExpiresAt: stop };
}

/**
 * The key behind a secret, or null when it is unknown, revoked or expired. All three give the same answer to the caller.
 * Used only by the public API wrapper.
 */
export async function authenticateKey(secret: string, now: Date): Promise<KeyAuth | null> {
  const { data, error } = await getAdminSupabase()
    .from('api_keys')
    .select(COLUMNS)
    .eq('key_hash', await hashKey(secret))
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const r = data as unknown as Row;
  if (keyState({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now) !== 'active') return null;
  return {
    id: r.id,
    companyId: r.company_id,
    mode: r.mode === 'sandbox' ? 'sandbox' : 'live',
    scopes: r.scopes,
    rateLimitPerMinute: r.rate_limit_per_minute,
    lastUsedAt: r.last_used_at,
  };
}
