// path: services/dispute/intake.ts
// A dispute starts at the processor. STEP 10 turns the processor's webhook into the events `dispute.opened`, `dispute.won`
// and `dispute.lost`; this file makes the case, tells the owner at once, and records the outcome. Everything here can run
// again for the same event without making a second case. The payload of those events carries only the ids, so the reason
// and the answer date start as "general" and an estimate; the owner enters the real ones from the processor (request R6
// asks STEP 10 to pass them on, and this file already uses them when they arrive).
import 'server-only';
import { DISPUTE_RESPONSE_DAYS } from '@/config/s13-portal';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { DomainEvent } from '@/types/events';
import { addDisputeEvent, applyMove, toDispute, DISPUTE_COLUMNS } from './disputes';
import { categorize } from './reasons';
import { canMove, type DisputeStatus } from './status';

const log = createLogger({ component: 'dispute-intake' });
const DAY = 86_400_000;

function text(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function isoOrNull(v: unknown): string | null {
  const s = text(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
}

/** Makes the case for a `dispute.opened` event. Returns the new case id, or null when it already existed. */
export async function openDisputeFromEvent(event: DomainEvent): Promise<string | null> {
  if (!event.companyId) return null;
  const companyId = event.companyId;
  const paymentId = text(event.payload.paymentId);
  if (!paymentId) return null;
  const admin = getAdminSupabase();
  const { data: payment, error } = await admin
    .from('payments')
    .select('id, invoice_id, client_id, amount, captured_amount')
    .eq('id', paymentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!payment) return null;
  const processorId = text(event.payload.processorId) ?? 'unknown';
  const reasonCode = text(event.payload.reasonCode);
  const given = isoOrNull(event.payload.dueBy);
  const stake = Money.parseRounded(
    String(event.payload.disputedAmount ?? payment.captured_amount ?? payment.amount),
  );
  const inserted = await admin
    .from('disputes')
    .insert({
      company_id: companyId,
      payment_id: paymentId,
      invoice_id: payment.invoice_id,
      client_id: payment.client_id,
      processor_id: processorId,
      processor_dispute_id: text(event.payload.disputeId),
      source_event_id: text(event.payload.eventId) ?? event.id,
      reason_code: reasonCode,
      reason_category: categorize(processorId, reasonCode),
      amount: stake.gt('0')
        ? stake.toDbString()
        : Money.parseRounded(String(payment.amount)).toDbString(),
      opened_at: event.occurredAt,
      due_at:
        given ?? new Date(Date.parse(event.occurredAt) + DISPUTE_RESPONSE_DAYS * DAY).toISOString(),
      due_estimated: given === null,
    })
    .select('id')
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') return null; // the same event or the same dispute again
    throw new InternalError(inserted.error);
  }
  const id = String(inserted.data.id);
  await addDisputeEvent(companyId, id, 'opened', `Opened at ${processorId}`);
  await getService('notification')
    .notify({
      companyId,
      type: 'dispute.opened',
      title: 'A client disputed a payment',
      body: `A dispute of ${stake.toDbString()} USD was opened. Send your evidence before the answer is due.`,
      href: `/disputes/${id}`,
    })
    .catch(() => log.error('dispute notification failed', {}));
  return id;
}

/** Records the outcome of a dispute (`won` or `lost`) on the open case of that payment. */
export async function closeDisputeFromEvent(
  event: DomainEvent,
  outcome: 'won' | 'lost',
): Promise<boolean> {
  if (!event.companyId) return false;
  const companyId = event.companyId;
  const admin = getAdminSupabase();
  const disputeId = text(event.payload.disputeId);
  let q = admin
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .not('status', 'in', '(won,lost,accepted,withdrawn)');
  q = disputeId
    ? q.eq('processor_dispute_id', disputeId)
    : q.eq('payment_id', text(event.payload.paymentId) ?? '');
  const { data, error } = await q.order('opened_at', { ascending: false }).limit(1);
  if (error) throw new InternalError(error);
  const row = data?.[0];
  if (!row) return false;
  const current = toDispute(row);
  const to = outcome as DisputeStatus;
  if (!canMove(current.status, to)) return false;
  await applyMove(companyId, current, to, `Decided by the processor: ${outcome}`, null);
  await getService('notification')
    .notify({
      companyId,
      type: `dispute.${outcome}`,
      title: outcome === 'won' ? 'A dispute was decided in your favour' : 'A dispute was lost',
      body: `The ${current.amount} USD dispute is closed.`,
      href: `/disputes/${current.id}`,
    })
    .catch(() => undefined);
  return true;
}
