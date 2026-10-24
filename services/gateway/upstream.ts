// path: services/gateway/upstream.ts
// The app of the main merchant that sub-merchant calls are sent to. One per company. The address is checked on every save, the
// signing secret is made by the platform, shown once and kept sealed; a rotated secret stays valid for a day next to the new one
// so the app can switch without downtime. A switched-off upstream stops all calls of the company's sub-merchants.
import 'server-only';
import { GATEWAY_SECRET_OVERLAP_HOURS } from '@/config/s16-gateway';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getPublicEnv } from '@/lib/env/public';
import {
  checkUpstreamBase,
  makeGatewaySecret,
  upstreamInput,
  upstreamUpdate,
} from '@/lib/gateway/rules';
import { previousSecretValid } from '@/lib/integrations/webhook-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, open, record, seal } from './db';

const COLUMNS =
  'id, company_id, base_url, secret_enc, secret_last4, previous_secret_enc, previous_secret_expires_at, timeout_ms, enabled, consecutive_failures, last_success_at, last_failure_at, last_error, version';

interface Row {
  id: string;
  company_id: string;
  base_url: string;
  secret_enc: EncryptedPayload;
  secret_last4: string;
  previous_secret_enc: EncryptedPayload | null;
  previous_secret_expires_at: string | null;
  timeout_ms: number;
  enabled: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  version: number;
}

export interface UpstreamView {
  id: string;
  baseUrl: string;
  timeoutMs: number;
  enabled: boolean;
  secretLast4: string;
  previousSecretExpiresAt: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  version: number;
}

const toView = (r: Row): UpstreamView => ({
  id: r.id,
  baseUrl: r.base_url,
  timeoutMs: r.timeout_ms,
  enabled: r.enabled,
  secretLast4: r.secret_last4,
  previousSecretExpiresAt: r.previous_secret_expires_at,
  consecutiveFailures: r.consecutive_failures,
  lastSuccessAt: r.last_success_at,
  lastFailureAt: r.last_failure_at,
  lastError: r.last_error,
  version: r.version,
});

function platformHost(): string | null {
  try {
    return new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).hostname;
  } catch {
    return null;
  }
}

function checkedBase(raw: string): string {
  const check = checkUpstreamBase(raw, platformHost());
  if (!check.ok) throw new ValidationError(check.reason);
  return check.base;
}

async function readRow(companyId: string): Promise<Row | null> {
  const { data, error } = await getAdminSupabase()
    .from('gateway_upstreams')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as unknown as Row | null) ?? null;
}

export async function getUpstream(companyId: string): Promise<UpstreamView | null> {
  const row = await readRow(companyId);
  return row ? toView(row) : null;
}

/** Makes the upstream of the company. The signing secret is in the answer once. */
export async function createUpstream(
  actor: Actor,
  input: unknown,
): Promise<{ upstream: UpstreamView; secret: string }> {
  const companyId = need(actor);
  const parsed = upstreamInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  if (await readRow(companyId)) throw new ConflictError('The company has its app address already.');
  const secret = makeGatewaySecret();
  const { data, error } = await getAdminSupabase()
    .from('gateway_upstreams')
    .insert({
      company_id: companyId,
      base_url: checkedBase(parsed.data.baseUrl),
      secret_enc: await seal(companyId, secret),
      secret_last4: secret.slice(-4),
      timeout_ms: parsed.data.timeoutMs,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const row = data as unknown as Row;
  await record(companyId, 'gateway.upstream_created', 'gateway_upstream', row.id, {
    host: new URL(row.base_url).host,
  });
  return { upstream: toView(row), secret };
}

export async function updateUpstream(actor: Actor, input: unknown): Promise<UpstreamView> {
  const companyId = need(actor);
  const parsed = upstreamUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await readRow(companyId);
  if (!current) throw new NotFoundError();
  const patch: Record<string, unknown> = {};
  if (d.baseUrl !== undefined) patch.base_url = checkedBase(d.baseUrl);
  if (d.timeoutMs !== undefined) patch.timeout_ms = d.timeoutMs;
  if (d.enabled !== undefined) patch.enabled = d.enabled;
  const { data, error } = await getAdminSupabase()
    .from('gateway_upstreams')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', current.id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0)
    throw new ConflictError('The settings changed. Reload and try again.');
  await record(companyId, 'gateway.upstream_changed', 'gateway_upstream', current.id, {
    fields: Object.keys(patch),
  });
  return toView(data[0] as unknown as Row);
}

/** A new signing secret (shown once). The old one stays valid for 24 hours. */
export async function rotateUpstreamSecret(
  actor: Actor,
): Promise<{ upstream: UpstreamView; secret: string; previousValidUntil: string }> {
  const companyId = need(actor);
  const current = await readRow(companyId);
  if (!current) throw new NotFoundError();
  const secret = makeGatewaySecret();
  const until = new Date(Date.now() + GATEWAY_SECRET_OVERLAP_HOURS * 3_600_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('gateway_upstreams')
    .update({
      secret_enc: await seal(companyId, secret),
      secret_last4: secret.slice(-4),
      previous_secret_enc: current.secret_enc,
      previous_secret_expires_at: until,
    })
    .eq('company_id', companyId)
    .eq('id', current.id)
    .eq('version', current.version)
    .select(COLUMNS);
  if (error) mapIntegrationError(error);
  if (!data || data.length === 0)
    throw new ConflictError('The settings changed. Reload and try again.');
  await record(companyId, 'gateway.upstream_secret_rotated', 'gateway_upstream', current.id, {
    previousValidUntil: until,
  });
  return {
    upstream: toView(data[0] as unknown as Row),
    secret,
    previousValidUntil: until,
  };
}

/** What a call needs: the address and the secrets (the new one, and the old one while it overlaps). */
export interface UpstreamTarget {
  id: string;
  base: string;
  timeoutMs: number;
  enabled: boolean;
  secrets: string[];
}

export async function loadUpstreamTarget(
  companyId: string,
  now: Date,
): Promise<UpstreamTarget | null> {
  const row = await readRow(companyId);
  if (!row) return null;
  const secrets = [await open(companyId, row.secret_enc)];
  if (row.previous_secret_enc && previousSecretValid(row.previous_secret_expires_at, now))
    secrets.push(await open(companyId, row.previous_secret_enc));
  return {
    id: row.id,
    base: row.base_url,
    timeoutMs: row.timeout_ms,
    enabled: row.enabled,
    secrets,
  };
}

/** Counts the result of a call on the upstream (for the owner's page). Failures here never break an answer. */
export async function noteUpstreamResult(
  companyId: string,
  id: string,
  ok: boolean,
  error: string | null,
): Promise<void> {
  const admin = getAdminSupabase();
  if (ok) {
    await admin
      .from('gateway_upstreams')
      .update({
        consecutive_failures: 0,
        last_success_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('company_id', companyId)
      .eq('id', id);
    return;
  }
  const { data } = await admin
    .from('gateway_upstreams')
    .select('consecutive_failures')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();
  await admin
    .from('gateway_upstreams')
    .update({
      consecutive_failures:
        Number((data as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1,
      last_failure_at: new Date().toISOString(),
      last_error: (error ?? 'The app did not answer.').slice(0, 300),
    })
    .eq('company_id', companyId)
    .eq('id', id);
}
