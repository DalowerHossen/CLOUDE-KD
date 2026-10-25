// path: services/payment/webhook-core.ts
// Webhook core (REQ-VERIFY item 5, Z12). Order of work, always:
//   1. the processor's adapter verifies the signature of the RAW body -> invalid: refuse, raise a security event, store nothing;
//   2. the event is stored once (unique processor + event id) -> a repeat is acknowledged and not processed again;
//   3. the event is processed. The payment state is never taken from the webhook body: the core asks the processor
//      for the transaction (getTransaction) and applies that answer;
//   4. a failure is retried with a growing delay and ends in the dead-letter list after WEBHOOK_MAX_ATTEMPTS.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_BASE_SECONDS } from '@/config/payment-risk';
import { loadAdapter, hasAdapter, isKnownProcessor } from '@/lib/payment/registry';
import { defaultMode } from '@/lib/payment/modes';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type {
  AdapterContext,
  NormalizedWebhookEvent,
  ProcessorId,
  WebhookRequest,
} from '@/types/contracts';
import { getProcessorRow, loadCurrentCredentials } from './credential-store';
import { applyExternalVoid, resumePayment } from './payments';
import { getRow, getRowByTransaction } from './payment-store';

const MAX_PAYLOAD_JSON = 100_000;
const EVENT_COLUMNS =
  'id, company_id, processor_id, event_id, event_type, processor_transaction_id, status, attempts, payload, error, occurred_at, processed_at, next_retry_at, created_at, version';

export interface StoredEvent {
  id: string;
  company_id: string | null;
  processor_id: ProcessorId;
  event_id: string;
  event_type: string;
  processor_transaction_id: string | null;
  status: 'received' | 'processed' | 'failed' | 'dead_letter' | 'ignored';
  attempts: number;
  payload: Record<string, unknown>;
  error: string | null;
  occurred_at: string | null;
  processed_at: string | null;
  next_retry_at: string | null;
  created_at: string;
  version: number;
}

export type WebhookOutcome =
  | { kind: 'unknown_processor' }
  | { kind: 'invalid_signature' }
  | { kind: 'bad_payload' }
  | { kind: 'duplicate' }
  | { kind: 'accepted'; status: StoredEvent['status'] };

async function contextFor(processorId: ProcessorId): Promise<AdapterContext> {
  const adapter = await loadAdapter(processorId);
  const processor = await getProcessorRow(processorId);
  const { values } = await loadCurrentCredentials(processorId);
  return {
    credentials: values,
    environment: processor.environment,
    mode: processor.active_mode || defaultMode(adapter).id,
    correlationId: getContext()?.correlationId ?? 'webhook',
  };
}

function boundedPayload(payload: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const text = JSON.stringify(payload);
  if (text.length <= MAX_PAYLOAD_JSON) return payload as Record<string, unknown>;
  return { truncated: true, size: text.length };
}

/** The entry point of every processor webhook route. */
export async function receiveWebhook(
  processorId: string,
  request: WebhookRequest,
): Promise<WebhookOutcome> {
  if (!isKnownProcessor(processorId) || !hasAdapter(processorId))
    return { kind: 'unknown_processor' };
  // A processor that is switched off (by a person or by the health check) takes no webhooks: 404, nothing is read or stored.
  const processorRow = await getProcessorRow(processorId).catch((error: unknown) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });
  if (!processorRow || !processorRow.enabled) return { kind: 'unknown_processor' };
  let context: AdapterContext;
  try {
    context = await contextFor(processorId);
  } catch (error) {
    if (error instanceof NotFoundError) return { kind: 'unknown_processor' };
    throw error;
  }
  const adapter = await loadAdapter(processorId);

  let verified = false;
  try {
    verified = await adapter.verifyWebhook(context, request);
  } catch (error) {
    logger.warn('webhook verification threw', {
      processor: processorId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
  if (!verified) {
    await getService('security').raiseSecurityEvent('webhook_signature_invalid', {
      source: 'payment',
      processor: processorId,
    });
    return { kind: 'invalid_signature' };
  }

  let event: NormalizedWebhookEvent;
  try {
    event = adapter.parseWebhook(request);
  } catch {
    logger.warn('webhook body could not be parsed', { processor: processorId });
    return { kind: 'bad_payload' };
  }
  if (
    event.processorId !== processorId ||
    event.eventId.length === 0 ||
    event.eventId.length > 200
  ) {
    return { kind: 'bad_payload' };
  }

  const db = getAdminSupabase();
  const { data, error } = await db
    .from('webhook_events')
    .insert({
      processor_id: processorId,
      event_id: event.eventId,
      event_type: event.type,
      processor_transaction_id: event.processorTransactionId,
      payload: boundedPayload(event.payload),
      occurred_at: event.occurredAt,
      status: 'received',
    })
    .select(EVENT_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') {
      const existing = await findEvent(processorId, event.eventId);
      // A delivery that failed before is processed again when the processor resends it; anything else is a repeat.
      if (existing && existing.status === 'failed') {
        const status = await processStored(existing);
        return { kind: 'accepted', status };
      }
      return { kind: 'duplicate' };
    }
    throw new InternalError(error);
  }
  const status = await processStored(data as StoredEvent);
  return { kind: 'accepted', status };
}

async function findEvent(processorId: ProcessorId, eventId: string): Promise<StoredEvent | null> {
  const { data, error } = await getAdminSupabase()
    .from('webhook_events')
    .select(EVENT_COLUMNS)
    .eq('processor_id', processorId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as StoredEvent | null) ?? null;
}

class PaymentNotFoundYet extends Error {}

/** Applies one stored event. Returns the status it was left in. */
async function processStored(event: StoredEvent): Promise<StoredEvent['status']> {
  const attempts = event.attempts + 1;
  try {
    const companyId = await apply(event);
    await update(event, {
      status: companyId === 'ignored' ? 'ignored' : 'processed',
      attempts,
      error: null,
      processed_at: new Date().toISOString(),
      next_retry_at: null,
      ...(companyId !== 'ignored' && companyId !== null ? { company_id: companyId } : {}),
    });
    return companyId === 'ignored' ? 'ignored' : 'processed';
  } catch (error) {
    const dead = attempts >= WEBHOOK_MAX_ATTEMPTS;
    const delay = WEBHOOK_RETRY_BASE_SECONDS * 2 ** (attempts - 1);
    logger.warn('webhook processing failed', {
      eventId: event.id,
      attempts,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await update(event, {
      status: dead ? 'dead_letter' : 'failed',
      attempts,
      error:
        error instanceof PaymentNotFoundYet
          ? 'The payment was not found yet.'
          : 'Processing failed.',
      next_retry_at: dead ? null : new Date(Date.now() + delay * 1000).toISOString(),
    });
    return dead ? 'dead_letter' : 'failed';
  }
}

async function update(event: StoredEvent, patch: Record<string, unknown>): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('webhook_events')
    .update(patch)
    .eq('id', event.id);
  if (error) throw new InternalError(error);
}

/** Returns the company id when the event changed a payment, "ignored" when it needs nothing, or null. */
async function apply(event: StoredEvent): Promise<string | 'ignored' | null> {
  const type = event.event_type;
  const relevant = type.startsWith('payment.') || type.startsWith('dispute.');
  if (!relevant || !event.processor_transaction_id) return 'ignored';
  const row = await getRowByTransaction(event.processor_id, event.processor_transaction_id);
  if (!row) {
    // The webhook can arrive before our own record stores the transaction id; try again later.
    if (type.startsWith('payment.')) throw new PaymentNotFoundYet();
    return 'ignored';
  }
  const fresh = await getRow(row.company_id, row.id);
  switch (type) {
    case 'payment.authorized':
    case 'payment.captured':
    case 'payment.failed':
      if (fresh.status === 'created' || fresh.status === 'requires_action') {
        await resumePayment(fresh.company_id, fresh.id);
        return fresh.company_id;
      }
      return 'ignored';
    case 'payment.voided':
      await applyExternalVoid(fresh);
      return fresh.company_id;
    case 'payment.refunded':
      // A refund made at the processor's own dashboard needs a person to reconcile it.
      await getService('audit').record({
        action: 'payment.refund.external_notice',
        resourceType: 'payment',
        resourceId: fresh.id,
        companyId: fresh.company_id,
        metadata: { processorId: event.processor_id, eventId: event.event_id },
      });
      return fresh.company_id;
    case 'dispute.opened':
      await getService('invoices').markDisputed(fresh.invoice_id);
      await publishDispute('dispute.opened', fresh.company_id, fresh.id, fresh.invoice_id, event);
      return fresh.company_id;
    case 'dispute.closed': {
      const outcome = String(event.payload.outcome ?? '');
      if (outcome === 'won' || outcome === 'lost') {
        await publishDispute(
          outcome === 'won' ? 'dispute.won' : 'dispute.lost',
          fresh.company_id,
          fresh.id,
          fresh.invoice_id,
          event,
        );
        return fresh.company_id;
      }
      return 'ignored';
    }
    default:
      return 'ignored';
  }
}

async function publishDispute(
  name: 'dispute.opened' | 'dispute.won' | 'dispute.lost',
  companyId: string,
  paymentId: string,
  invoiceId: string,
  event: StoredEvent,
): Promise<void> {
  await getService('events').publish({
    name,
    companyId,
    payload: {
      paymentId,
      invoiceId,
      processorId: event.processor_id,
      eventId: event.event_id,
      disputeId: typeof event.payload.disputeId === 'string' ? event.payload.disputeId : null,
    },
  });
}

/** Retries failed events whose time has come, and events left half done by a crash. Run by the cron job. */
export async function retryDueWebhooks(limit: number): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('webhook_events')
    .select(EVENT_COLUMNS)
    .or(
      `and(status.eq.failed,next_retry_at.lte.${new Date().toISOString()}),and(status.eq.received,created_at.lt.${new Date(Date.now() - 300_000).toISOString()})`,
    )
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new InternalError(error);
  let done = 0;
  for (const e of (data ?? []) as StoredEvent[]) {
    await processStored(e);
    done += 1;
  }
  return done;
}

export interface WebhookListItem {
  id: string;
  processorId: string;
  eventId: string;
  eventType: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
}

export async function listWebhookEvents(filter: {
  status?: StoredEvent['status'];
  limit: number;
}): Promise<WebhookListItem[]> {
  let query = getAdminSupabase()
    .from('webhook_events')
    .select(
      'id, processor_id, event_id, event_type, status, attempts, error, created_at, processed_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filter.limit);
  if (filter.status) query = query.eq('status', filter.status);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    processorId: String(r.processor_id),
    eventId: String(r.event_id),
    eventType: String(r.event_type),
    status: String(r.status),
    attempts: r.attempts as number,
    error: r.error ? String(r.error) : null,
    createdAt: String(r.created_at),
    processedAt: r.processed_at ? String(r.processed_at) : null,
  }));
}

/** An administrator processes a failed or dead-letter event again. */
export async function retryWebhookEvent(id: string): Promise<StoredEvent['status']> {
  const { data, error } = await getAdminSupabase()
    .from('webhook_events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const event = data as StoredEvent;
  if (event.status !== 'failed' && event.status !== 'dead_letter') return event.status;
  const status = await processStored({
    ...event,
    attempts: Math.min(event.attempts, WEBHOOK_MAX_ATTEMPTS - 1),
  });
  await getService('audit').record({
    action: 'payment.webhook.retry',
    resourceType: 'webhook_event',
    resourceId: id,
    metadata: { processorId: event.processor_id, result: status },
  });
  return status;
}
