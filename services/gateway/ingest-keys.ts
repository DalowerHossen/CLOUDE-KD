// path: services/gateway/ingest-keys.ts
// Keys with which the main merchant's app posts settlement entries. The secret is made once and shown once; only its SHA-256 hash is
// stored. A key can post entries and nothing else. Unknown, revoked and expired keys look the same to the caller.
import 'server-only';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { INGEST_MAX_KEYS, ingestKeyInput, makeIngestKey } from '@/lib/gateway/ingest-rules';
import {
  expiryFromDays,
  hashKey,
  keyState,
  maskedKey,
  type KeyState,
} from '@/lib/integrations/api-key-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record } from './db';

const COLUMNS =
  'id, company_id, name, key_prefix, last_chars, rate_limit_per_minute, allowed_ips, expires_at, revoked_at, last_used_at, created_at';

interface Row {
  id: string;
  company_id: string;
  name: string;
  key_prefix: string;
  last_chars: string;
  rate_limit_per_minute: number;
  allowed_ips: string[] | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface IngestKeyView {
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
}

const toView = (r: Row, now: Date): IngestKeyView => ({
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
});

export async function listIngestKeys(companyId: string): Promise<IngestKeyView[]> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_ingest_keys')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  const now = new Date();
  return ((data ?? []) as unknown as Row[]).map((r) => toView(r, now));
}

export async function createIngestKey(
  actor: Actor,
  input: unknown,
): Promise<{ key: IngestKeyView; secret: string }> {
  const companyId = need(actor);
  const parsed = ingestKeyInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The key is not valid.');
  const d = parsed.data;
  const existing = await listIngestKeys(companyId);
  if (existing.filter((k) => k.state === 'active').length >= INGEST_MAX_KEYS)
    throw new ConflictError(
      `A company can have ${INGEST_MAX_KEYS} active keys of this kind at most.`,
    );
  const made = await makeIngestKey();
  const { data, error } = await getAdminSupabase()
    .from('settlement_ingest_keys')
    .insert({
      company_id: companyId,
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
  await record(companyId, 'settlement.ingest_key_created', 'settlement_ingest_key', key.id, {
    name: d.name,
    ipRestricted: d.allowedIps !== null && d.allowedIps.length > 0,
  });
  return { key, secret: made.secret };
}

export async function revokeIngestKey(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('settlement_ingest_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .is('revoked_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await record(companyId, 'settlement.ingest_key_revoked', 'settlement_ingest_key', id, {});
}

export interface IngestKeyAuth {
  keyId: string;
  companyId: string;
  rateLimitPerMinute: number;
  allowedIps: string[] | null;
  lastUsedAt: string | null;
}

/** The key behind a secret, or null when it is unknown, revoked or expired (the three look the same). */
export async function authenticateIngestKey(
  secret: string,
  now: Date,
): Promise<IngestKeyAuth | null> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_ingest_keys')
    .select(COLUMNS)
    .eq('key_hash', await hashKey(secret))
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  const r = data as unknown as Row;
  if (keyState({ expiresAt: r.expires_at, revokedAt: r.revoked_at }, now) !== 'active') return null;
  return {
    keyId: r.id,
    companyId: r.company_id,
    rateLimitPerMinute: r.rate_limit_per_minute,
    allowedIps: r.allowed_ips,
    lastUsedAt: r.last_used_at,
  };
}

const MARK_EVERY_MS = 60_000;

export async function markIngestKeyUsed(auth: IngestKeyAuth, now: Date): Promise<void> {
  if (auth.lastUsedAt !== null && now.getTime() - Date.parse(auth.lastUsedAt) <= MARK_EVERY_MS)
    return;
  await getAdminSupabase()
    .from('settlement_ingest_keys')
    .update({ last_used_at: now.toISOString() })
    .eq('id', auth.keyId)
    .eq('company_id', auth.companyId);
}
