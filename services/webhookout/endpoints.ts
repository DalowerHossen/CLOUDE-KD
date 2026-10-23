// path: services/webhookout/endpoints.ts
// Webhook endpoints of a company. The signing secret is made by the platform, shown once, and kept encrypted (purpose
// `oauth-tokens`, scoped to the company). Rotating makes a new secret and keeps the old one valid for 24 hours; during that time
// every delivery carries both signatures. Every change is audited. An endpoint that was switched off after repeated failures is
// switched on again by setting it active, which also clears its failure count.
import 'server-only';
import { WEBHOOK_MAX_ENDPOINTS, WEBHOOK_SECRET_OVERLAP_HOURS } from '@/config/s16-api';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { endpointInput, endpointUpdate, makeSecret } from '@/lib/integrations/webhook-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';

const COLUMNS =
  'id, url, description, events, status, source, secret_last4, previous_secret_expires_at, consecutive_failures, last_success_at, last_failure_at, disabled_at, disabled_reason, created_at, version';

interface Row {
  id: string;
  url: string;
  description: string;
  events: string[];
  status: string;
  source: string;
  secret_last4: string;
  previous_secret_expires_at: string | null;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  version: number;
}

export interface EndpointView {
  id: string;
  url: string;
  description: string;
  events: string[];
  status: 'active' | 'paused' | 'disabled';
  source: string;
  secretLast4: string;
  previousSecretExpiresAt: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  version: number;
}

const toView = (r: Row): EndpointView => ({
  id: r.id,
  url: r.url,
  description: r.description,
  events: r.events,
  status: r.status === 'paused' ? 'paused' : r.status === 'disabled' ? 'disabled' : 'active',
  source: r.source,
  secretLast4: r.secret_last4,
  previousSecretExpiresAt: r.previous_secret_expires_at,
  consecutiveFailures: r.consecutive_failures,
  lastSuccessAt: r.last_success_at,
  lastFailureAt: r.last_failure_at,
  disabledAt: r.disabled_at,
  disabledReason: r.disabled_reason,
  createdAt: r.created_at,
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
    resourceType: 'webhook_endpoint',
    resourceId: id,
    companyId,
    metadata,
  });
}

const seal = (companyId: string, secret: string): Promise<EncryptedPayload> =>
  getService('encryption').encrypt('oauth-tokens', secret, companyId);

export async function listEndpoints(companyId: string): Promise<EndpointView[]> {
  const { data, error } = await getAdminSupabase()
    .from('webhook_endpoints')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function getEndpoint(companyId: string, id: string): Promise<EndpointView> {
  const { data, error } = await getAdminSupabase()
    .from('webhook_endpoints')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data as unknown as Row);
}

export async function createEndpoint(
  actor: Actor,
  input: unknown,
  source: 'manual' | 'zapier' | 'make' = 'manual',
): Promise<{ endpoint: EndpointView; secret: string }> {
  const companyId = need(actor);
  const parsed = endpointInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The endpoint is not valid.');
  const d = parsed.data;
  const existing = await listEndpoints(companyId);
  if (existing.length >= WEBHOOK_MAX_ENDPOINTS)
    throw new ConflictError(
      `A company can have ${WEBHOOK_MAX_ENDPOINTS} webhook endpoints at most.`,
    );
  const secret = makeSecret();
  const { data, error } = await getAdminSupabase()
    .from('webhook_endpoints')
    .insert({
      company_id: companyId,
      url: d.url.trim(),
      description: d.description,
      events: d.events,
      source,
      secret_enc: await seal(companyId, secret),
      secret_last4: secret.slice(-4),
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapIntegrationError(error);
  const endpoint = toView(data as unknown as Row);
  await record(companyId, 'webhook_endpoint.created', endpoint.id, {
    url: endpoint.url,
    events: endpoint.events,
  });
  return { endpoint, secret };
}

export async function updateEndpoint(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<EndpointView> {
  const companyId = need(actor);
  const parsed = endpointUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const current = await getEndpoint(companyId, id);
  const patch: Record<string, unknown> = {};
  if (d.url !== undefined) patch.url = d.url.trim();
  if (d.description !== undefined) patch.description = d.description;
  if (d.events !== undefined) patch.events = d.events;
  if (d.status !== undefined) {
    patch.status = d.status;
    // Setting an endpoint active again clears the failures that switched it off.
    patch.disabled_at = null;
    patch.disabled_reason = null;
    if (d.status === 'active' && current.status === 'disabled') patch.consecutive_failures = 0;
  }
  const { data, error } = await getAdminSupabase()
    .from('webhook_endpoints')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapIntegrationError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The endpoint changed or was removed. Reload and try again.');
  await record(companyId, 'webhook_endpoint.changed', id, { fields: Object.keys(patch) });
  return getEndpoint(companyId, id);
}

/** Removes an endpoint. Its deliveries that are still waiting are cancelled. */
export async function deleteEndpoint(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await getEndpoint(companyId, id);
  const admin = getAdminSupabase();
  const cancelled = await admin
    .from('webhook_deliveries')
    .update({ status: 'cancelled', next_attempt_at: null, locked_until: null })
    .eq('company_id', companyId)
    .eq('endpoint_id', id)
    .in('status', ['pending', 'retrying']);
  if (cancelled.error) mapIntegrationError(cancelled.error);
  const { error } = await admin
    .from('webhook_endpoints')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'webhook_endpoint.removed', id, {});
}

/** A new signing secret (shown once). The old one stays valid for 24 hours so a receiver can switch without downtime. */
export async function rotateSecret(
  actor: Actor,
  id: string,
): Promise<{ endpoint: EndpointView; secret: string; previousValidUntil: string }> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  const { data: row, error: readError } = await admin
    .from('webhook_endpoints')
    .select('secret_enc')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) throw new InternalError(readError);
  if (!row) throw new NotFoundError();
  const secret = makeSecret();
  const until = new Date(Date.now() + WEBHOOK_SECRET_OVERLAP_HOURS * 3_600_000).toISOString();
  const { error } = await admin
    .from('webhook_endpoints')
    .update({
      secret_enc: await seal(companyId, secret),
      secret_last4: secret.slice(-4),
      previous_secret_enc: (row as { secret_enc: unknown }).secret_enc,
      previous_secret_expires_at: until,
    })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  await record(companyId, 'webhook_endpoint.secret_rotated', id, { previousValidUntil: until });
  return { endpoint: await getEndpoint(companyId, id), secret, previousValidUntil: until };
}
