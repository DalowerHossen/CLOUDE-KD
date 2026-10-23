// path: services/webhookout/deliveries.ts
// The delivery log of an endpoint: each delivery with its tries, and a replay that sends the same event again with a fresh
// signature time.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getEndpoint } from './endpoints';

const COLUMNS =
  'id, endpoint_id, event_id, event_name, kind, replay_of, status, attempts, next_attempt_at, last_status_code, last_error, last_attempt_at, delivered_at, created_at';

interface Row {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_name: string;
  kind: string;
  replay_of: string | null;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface DeliveryView {
  id: string;
  endpointId: string;
  eventId: string;
  eventName: string;
  kind: 'event' | 'test' | 'replay';
  replayOf: string | null;
  status: 'pending' | 'succeeded' | 'retrying' | 'dead' | 'cancelled';
  attempts: number;
  nextAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export const toDeliveryView = (r: Row): DeliveryView => ({
  id: r.id,
  endpointId: r.endpoint_id,
  eventId: r.event_id,
  eventName: r.event_name,
  kind: r.kind === 'test' ? 'test' : r.kind === 'replay' ? 'replay' : 'event',
  replayOf: r.replay_of,
  status:
    r.status === 'succeeded'
      ? 'succeeded'
      : r.status === 'retrying'
        ? 'retrying'
        : r.status === 'dead'
          ? 'dead'
          : r.status === 'cancelled'
            ? 'cancelled'
            : 'pending',
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  lastStatusCode: r.last_status_code,
  lastError: r.last_error,
  lastAttemptAt: r.last_attempt_at,
  deliveredAt: r.delivered_at,
  createdAt: r.created_at,
});

export interface AttemptView {
  attempt: number;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  responseBody: string;
  durationMs: number;
  createdAt: string;
}

export async function listDeliveries(
  companyId: string,
  endpointId: string,
  limit = 50,
): Promise<DeliveryView[]> {
  await getEndpoint(companyId, endpointId);
  const { data, error } = await getAdminSupabase()
    .from('webhook_deliveries')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('endpoint_id', endpointId)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toDeliveryView);
}

export async function getDelivery(
  companyId: string,
  deliveryId: string,
): Promise<{ delivery: DeliveryView; attempts: AttemptView[] }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('webhook_deliveries')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', deliveryId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const tries = await admin
    .from('webhook_delivery_attempts')
    .select('attempt, status_code, ok, error, response_body, duration_ms, created_at')
    .eq('company_id', companyId)
    .eq('delivery_id', deliveryId)
    .order('attempt', { ascending: true })
    .limit(50);
  if (tries.error) throw new InternalError(tries.error);
  return {
    delivery: toDeliveryView(data as unknown as Row),
    attempts: (tries.data ?? []).map((a) => ({
      attempt: Number(a.attempt),
      statusCode: a.status_code === null ? null : Number(a.status_code),
      ok: Boolean(a.ok),
      error: a.error === null ? null : String(a.error),
      responseBody: String(a.response_body ?? ''),
      durationMs: Number(a.duration_ms),
      createdAt: String(a.created_at),
    })),
  };
}

/** Sends the same event again: a new delivery with a copy of the payload, tried with the full retry schedule. */
export async function replayDelivery(actor: Actor, deliveryId: string): Promise<DeliveryView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('webhook_deliveries')
    .select('id, endpoint_id, event_id, event_name, payload, status')
    .eq('company_id', companyId)
    .eq('id', deliveryId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const source = data as unknown as {
    id: string;
    endpoint_id: string;
    event_id: string;
    event_name: string;
    payload: unknown;
    status: string;
  };
  const endpoint = await getEndpoint(companyId, source.endpoint_id);
  if (endpoint.status !== 'active')
    throw new ValidationError('Switch the endpoint on before sending an event again.');
  if (source.status === 'pending' || source.status === 'retrying')
    throw new ValidationError('This delivery is still waiting. Wait for its result first.');
  const created = await admin
    .from('webhook_deliveries')
    .insert({
      company_id: companyId,
      endpoint_id: source.endpoint_id,
      event_id: source.event_id,
      event_name: source.event_name,
      kind: 'replay',
      replay_of: source.id,
      payload: source.payload,
      next_attempt_at: new Date().toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (created.error) mapIntegrationError(created.error);
  const view = toDeliveryView(created.data as unknown as Row);
  await getService('audit').record({
    action: 'webhook_delivery.replayed',
    resourceType: 'webhook_delivery',
    resourceId: view.id,
    companyId,
    metadata: { replayOf: source.id, endpointId: source.endpoint_id },
  });
  return view;
}
