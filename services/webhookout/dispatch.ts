// path: services/webhookout/dispatch.ts
// Sends events to webhook endpoints. `fanOut` writes one delivery per subscribed, active endpoint for a domain event (once: a
// second delivery of the same event changes nothing). `runDue` takes the deliveries that are due and sends them: each try is
// signed, recorded in the delivery log, and decides the next step (done, retry after a delay, or give up). Repeated failures
// switch the endpoint off and tell the owner. A test event is tried once and never changes the failure count of the endpoint.
import 'server-only';
import { WEBHOOK_BATCH, WEBHOOK_LOCK_SECONDS, WEBHOOK_EVENTS } from '@/config/s16-api';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  afterAttempt,
  buildEnvelope,
  clipBody,
  deliveryHeaders,
  isSuccess,
  previousSecretValid,
  shouldDisable,
  signatureHeader,
  testEnvelope,
} from '@/lib/integrations/webhook-rules';
import { checkWebhookUrl } from '@/lib/integrations/ssrf';
import { httpsTransport, type Transport } from '@/lib/integrations/webhook-transport';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, DomainEvent, EncryptedPayload } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { getEndpoint } from './endpoints';
import { toDeliveryView, type DeliveryView } from './deliveries';

const log = createLogger({ service: 'webhookout' });
const SUBSCRIBABLE: readonly string[] = WEBHOOK_EVENTS;

interface DeliveryRow {
  id: string;
  company_id: string;
  endpoint_id: string;
  event_id: string;
  event_name: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

interface EndpointRow {
  id: string;
  url: string;
  status: string;
  secret_enc: EncryptedPayload;
  previous_secret_enc: EncryptedPayload | null;
  previous_secret_expires_at: string | null;
  consecutive_failures: number;
}

/** One delivery per active endpoint of the company that subscribed to the event. */
export async function fanOut(event: DomainEvent): Promise<{ created: number }> {
  if (event.companyId === null || !SUBSCRIBABLE.includes(event.name)) return { created: 0 };
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('webhook_endpoints')
    .select('id')
    .eq('company_id', event.companyId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .contains('events', [event.name]);
  if (error) throw new InternalError(error);
  const envelope = buildEnvelope({
    eventId: event.id,
    name: event.name,
    occurredAt: event.occurredAt,
    payload: event.payload,
  });
  let created = 0;
  for (const endpoint of data ?? []) {
    const insert = await admin.from('webhook_deliveries').insert({
      company_id: event.companyId,
      endpoint_id: String(endpoint.id),
      event_id: event.id,
      event_name: event.name,
      kind: 'event',
      payload: envelope,
      next_attempt_at: new Date().toISOString(),
    });
    if (insert.error) {
      // The same event for the same endpoint was already written: nothing to do.
      if (insert.error.code === '23505') continue;
      mapIntegrationError(insert.error);
    }
    created += 1;
  }
  return { created };
}

async function secretsOf(companyId: string, e: EndpointRow, now: Date): Promise<string[]> {
  const enc = getService('encryption');
  const open = async (p: EncryptedPayload): Promise<string> =>
    new TextDecoder().decode(await enc.decrypt('oauth-tokens', p, companyId));
  const out = [await open(e.secret_enc)];
  if (e.previous_secret_enc && previousSecretValid(e.previous_secret_expires_at, now))
    out.push(await open(e.previous_secret_enc));
  return out;
}

async function switchOff(companyId: string, endpointId: string, failures: number): Promise<void> {
  const reason = `Switched off after ${failures} failed tries in a row.`;
  const { error } = await getAdminSupabase()
    .from('webhook_endpoints')
    .update({ status: 'disabled', disabled_at: new Date().toISOString(), disabled_reason: reason })
    .eq('company_id', companyId)
    .eq('id', endpointId)
    .eq('status', 'active');
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'webhook_endpoint.disabled',
    resourceType: 'webhook_endpoint',
    resourceId: endpointId,
    companyId,
    metadata: { failures },
  });
  await getService('notification').notify({
    companyId,
    type: 'webhook.disabled',
    title: 'A webhook endpoint was switched off',
    body: 'An endpoint failed too many times in a row and no more events are sent to it. Check the address, then switch it on again.',
    href: '/developers/webhooks',
  });
}

/** Sends one claimed or new delivery and records the result. Returns the delivery as it stands afterwards. */
export async function attemptDelivery(
  row: DeliveryRow,
  transport: Transport = httpsTransport,
): Promise<DeliveryView> {
  const admin = getAdminSupabase();
  const now = new Date();
  const isTest = row.kind === 'test';
  const { data: endpointData, error: endpointError } = await admin
    .from('webhook_endpoints')
    .select(
      'id, url, status, secret_enc, previous_secret_enc, previous_secret_expires_at, consecutive_failures',
    )
    .eq('company_id', row.company_id)
    .eq('id', row.endpoint_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (endpointError) throw new InternalError(endpointError);
  const finish = async (patch: Record<string, unknown>): Promise<DeliveryView> => {
    const { data, error } = await admin
      .from('webhook_deliveries')
      .update({ ...patch, locked_until: null })
      .eq('id', row.id)
      .select(
        'id, endpoint_id, event_id, event_name, kind, replay_of, status, attempts, next_attempt_at, last_status_code, last_error, last_attempt_at, delivered_at, created_at',
      )
      .single();
    if (error) throw new InternalError(error);
    return toDeliveryView(data as never);
  };
  const endpoint = endpointData as unknown as EndpointRow | null;
  // A deleted, paused or switched-off endpoint gets no automatic delivery (a test may still be sent).
  if (!endpoint || (!isTest && endpoint.status !== 'active'))
    return finish({ status: 'cancelled', next_attempt_at: null });

  const attempt = row.attempts + 1;
  const body = JSON.stringify(row.payload);
  const target = checkWebhookUrl(endpoint.url);
  let result: { statusCode: number | null; body: string; error: string | null; durationMs: number };
  if (!target.ok) {
    result = { statusCode: null, body: '', error: target.reason, durationMs: 0 };
  } else {
    const signature = await signatureHeader(
      await secretsOf(row.company_id, endpoint, now),
      Math.floor(now.getTime() / 1000),
      body,
    );
    result = await transport({
      url: target.url,
      headers: deliveryHeaders({
        deliveryId: row.id,
        eventId: row.event_id,
        eventName: row.event_name,
        attempt,
        signature,
      }),
      body,
    });
  }
  const ok = isSuccess(result.statusCode);
  const error = ok
    ? null
    : (
        result.error ??
        (result.statusCode === null ? 'No answer.' : `The receiver answered ${result.statusCode}.`)
      ).slice(0, 300);

  const attemptRow = await admin.from('webhook_delivery_attempts').insert({
    company_id: row.company_id,
    delivery_id: row.id,
    attempt,
    status_code: result.statusCode,
    response_body: clipBody(result.body),
    error,
    duration_ms: result.durationMs,
    ok,
  });
  if (attemptRow.error) throw new InternalError(attemptRow.error);

  const next = isTest
    ? ok
      ? afterAttempt(attempt, true)
      : ({ status: 'dead' } as const)
    : afterAttempt(attempt, ok);
  const base = {
    attempts: attempt,
    last_status_code: result.statusCode,
    last_error: error,
    last_attempt_at: now.toISOString(),
  };
  const view = await finish(
    next.status === 'succeeded'
      ? { ...base, status: 'succeeded', next_attempt_at: null, delivered_at: now.toISOString() }
      : next.status === 'retrying'
        ? {
            ...base,
            status: 'retrying',
            next_attempt_at: new Date(now.getTime() + next.delaySeconds * 1000).toISOString(),
          }
        : { ...base, status: 'dead', next_attempt_at: null },
  );

  if (!isTest) {
    if (ok) {
      const { error: e } = await admin
        .from('webhook_endpoints')
        .update({ consecutive_failures: 0, last_success_at: now.toISOString() })
        .eq('id', endpoint.id);
      if (e) log.warn('endpoint success mark failed', { error: e });
    } else {
      const failures = endpoint.consecutive_failures + 1;
      const { error: e } = await admin
        .from('webhook_endpoints')
        .update({ consecutive_failures: failures, last_failure_at: now.toISOString() })
        .eq('id', endpoint.id);
      if (e) log.warn('endpoint failure mark failed', { error: e });
      if (shouldDisable(failures)) await switchOff(row.company_id, endpoint.id, failures);
    }
  }
  return view;
}

/** Takes the due deliveries and sends them. Called every minute by the cron job. */
export async function runDue(
  limit: number = WEBHOOK_BATCH,
  transport: Transport = httpsTransport,
): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const { data, error } = await getAdminSupabase().rpc('kd_claim_webhook_deliveries', {
    p_limit: limit,
    p_lock_seconds: WEBHOOK_LOCK_SECONDS,
  });
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as DeliveryRow[];
  const summary = { claimed: rows.length, succeeded: 0, failed: 0 };
  for (const row of rows) {
    try {
      const view = await attemptDelivery(row, transport);
      if (view.status === 'succeeded') summary.succeeded += 1;
      else summary.failed += 1;
    } catch (failure) {
      summary.failed += 1;
      log.error('delivery attempt failed', { deliveryId: row.id, error: failure });
    }
  }
  return summary;
}

/** Sends a test event to an endpoint right away (one try) and returns the result. */
export async function sendTest(actor: Actor, endpointId: string): Promise<DeliveryView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const endpoint = await getEndpoint(companyId, endpointId);
  const id = crypto.randomUUID();
  const envelope = testEnvelope(id, new Date());
  const { data, error } = await getAdminSupabase()
    .from('webhook_deliveries')
    .insert({
      company_id: companyId,
      endpoint_id: endpoint.id,
      event_id: String(envelope.id),
      event_name: 'webhook.test',
      kind: 'test',
      payload: envelope,
      next_attempt_at: new Date().toISOString(),
      locked_until: new Date(Date.now() + WEBHOOK_LOCK_SECONDS * 1000).toISOString(),
    })
    .select('id, company_id, endpoint_id, event_id, event_name, kind, payload, attempts')
    .single();
  if (error) mapIntegrationError(error);
  if (!data) throw new NotFoundError();
  const view = await attemptDelivery(data as unknown as DeliveryRow);
  await getService('audit').record({
    action: 'webhook_endpoint.tested',
    resourceType: 'webhook_endpoint',
    resourceId: endpoint.id,
    companyId,
    metadata: { delivery: view.id, status: view.status, statusCode: view.lastStatusCode },
  });
  return view;
}
