// path: services/accounting/posting.ts
// Automated posting: a domain event becomes a balanced journal entry through the posting rules table. The entry is made
// once per source key (an invoice is posted once however many times its event arrives), every event leaves a row in the
// posting log (posted, skipped with a reason, or failed) and the owner can review what the system posted.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { DomainEvent } from '@/types/events';
import type { Actor } from '@/types/contracts';
import { resolveAccount } from './accounts';
import { mapAccountingError } from './db-errors';
import { postSystemEntry } from './journals';
import type { JournalLineInput } from './journal-rules';
import { POSTING_EVENTS, planEntry, type EventFacts, type PostingEventName } from './posting-rules';

const log = createLogger({ component: 'accounting-posting' });

const isPostingEvent = (name: string): name is PostingEventName =>
  (POSTING_EVENTS as readonly string[]).includes(name);
const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** A fact that is not there yet (for example the settlement of a payment): the event is delivered again later. */
class NotReadyError extends ConflictError {}

async function settlementOf(
  companyId: string,
  paymentId: string,
): Promise<EventFacts['settlement']> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_items')
    .select('mode, gross, net')
    .eq('company_id', companyId)
    .eq('payment_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotReadyError('The settlement of the payment is not recorded yet.');
  const mode = String(data.mode);
  return {
    mode: mode === 'direct' ? 'direct' : mode === 'suspended' ? 'suspended' : 'mor',
    gross: Money.parseRounded(String(data.gross)).toDbString(),
    net: Money.parseRounded(String(data.net)).toDbString(),
  };
}

async function gatherFacts(event: DomainEvent, companyId: string): Promise<EventFacts> {
  const facts: EventFacts = { eventId: event.id, occurredAt: event.occurredAt };
  const admin = getAdminSupabase();
  if (event.name === 'invoice.sent') {
    const id = text(event.payload.invoiceId);
    if (id) {
      const { data, error } = await admin
        .from('invoices')
        .select('number, issue_date, total, tax_total')
        .eq('company_id', companyId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new InternalError(error);
      if (data) {
        facts.invoice = {
          number: String(data.number ?? ''),
          issueDate: String(data.issue_date),
          total: Money.parseRounded(String(data.total)).toDbString(),
          taxTotal: Money.parseRounded(String(data.tax_total ?? '0')).toDbString(),
        };
      }
    }
  }
  if (
    event.name === 'payment.captured' ||
    event.name === 'payment.refunded' ||
    event.name === 'dispute.lost'
  ) {
    const paymentId = text(event.payload.paymentId);
    if (paymentId) facts.settlement = await settlementOf(companyId, paymentId);
  }
  if (event.name === 'dispute.lost') {
    const paymentId = text(event.payload.paymentId);
    if (paymentId) {
      let q = admin
        .from('disputes')
        .select('amount')
        .eq('company_id', companyId)
        .eq('payment_id', paymentId)
        .is('deleted_at', null);
      const disputeId = text(event.payload.disputeId);
      if (disputeId) q = q.eq('processor_dispute_id', disputeId);
      const { data, error } = await q.order('opened_at', { ascending: false }).limit(1);
      if (error) throw new InternalError(error);
      if (data?.[0]) facts.disputeAmount = Money.parseRounded(String(data[0].amount)).toDbString();
    }
  }
  return facts;
}

type LogStatus = 'posted' | 'skipped' | 'failed';

async function writeLog(
  companyId: string,
  event: DomainEvent,
  status: LogStatus,
  entryId: string | null,
  reason: string,
): Promise<void> {
  const admin = getAdminSupabase();
  const row = {
    company_id: companyId,
    event_id: event.id,
    event_name: event.name,
    rule: event.name,
    status,
    entry_id: entryId,
    reason: reason.slice(0, 500),
  };
  const found = await admin
    .from('posting_log')
    .select('id, attempts')
    .eq('company_id', companyId)
    .eq('event_id', event.id)
    .eq('rule', event.name)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (found.data) {
    const { error } = await admin
      .from('posting_log')
      .update({
        status,
        entry_id: entryId,
        reason: row.reason,
        attempts: Number(found.data.attempts) + 1,
      })
      .eq('id', found.data.id);
    if (error) throw new InternalError(error);
    return;
  }
  const { error } = await admin.from('posting_log').insert(row);
  if (error && error.code !== '23505') throw new InternalError(error);
}

async function reverseBySourceKey(
  companyId: string,
  sourceKey: string,
  date: string,
  reason: string,
): Promise<{ entryId: string | null; skip: string | null }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('journal_entries')
    .select('id, status, reversed_by_id')
    .eq('company_id', companyId)
    .eq('source_key', sourceKey)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return { entryId: null, skip: 'The invoice was never posted.' };
  if (data.reversed_by_id) return { entryId: null, skip: 'The entry is already reversed.' };
  const out = await admin.rpc('kd_journal_reverse', {
    p_company: companyId,
    p_entry: data.id,
    p_date: date,
    p_reason: reason,
    p_actor: null,
  });
  if (out.error) mapAccountingError(out.error);
  return { entryId: String((out.data as { entry_id: string }).entry_id), skip: null };
}

/** Posts the entry of one domain event. Safe to run again for the same event. */
export async function processEvent(event: DomainEvent): Promise<void> {
  if (!event.companyId || !isPostingEvent(event.name)) return;
  const companyId = event.companyId;
  try {
    const facts = await gatherFacts(event, companyId);
    const plan = planEntry(event.name as PostingEventName, event.payload, facts);
    if (plan.kind === 'skip') {
      await writeLog(companyId, event, 'skipped', null, plan.reason);
      return;
    }
    if (plan.kind === 'reverse') {
      const done = await reverseBySourceKey(companyId, plan.sourceKey, plan.date, plan.reason);
      if (done.entryId) await writeLog(companyId, event, 'posted', done.entryId, plan.reason);
      else await writeLog(companyId, event, 'skipped', null, done.skip ?? '');
      return;
    }
    const ids = new Map<string, string>();
    const lines: JournalLineInput[] = [];
    for (const l of plan.entry.lines) {
      let accountId = l.accountId;
      if (!accountId) {
        const cached = ids.get(l.key);
        accountId = cached ?? (await resolveAccount(companyId, l.key));
        ids.set(l.key, accountId);
      }
      lines.push({
        accountId,
        debit: l.side === 'debit' ? l.amount.toDbString() : '0',
        credit: l.side === 'credit' ? l.amount.toDbString() : '0',
        description: l.description,
      });
    }
    const posted = await postSystemEntry({
      companyId,
      date: plan.entry.date,
      memo: plan.entry.memo,
      sourceType: plan.entry.sourceType,
      sourceId: plan.entry.sourceId,
      sourceKey: plan.entry.sourceKey,
      lines,
    });
    await writeLog(
      companyId,
      event,
      'posted',
      posted.entryId,
      posted.replay ? 'Already posted.' : '',
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The event could not be posted.';
    log.error('posting failed', { eventId: event.id, name: event.name, companyId, error: reason });
    await writeLog(companyId, event, 'failed', null, reason).catch(() => undefined);
    throw error;
  }
}

/** Makes the entry of one stored event again (idempotent: the same source key returns the first entry). */
export async function repost(eventId: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('domain_events')
    .select('id, name, company_id, payload, correlation_id, occurred_at')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  await processEvent({
    id: String(data.id),
    name: String(data.name) as DomainEvent['name'],
    companyId: data.company_id ? String(data.company_id) : null,
    occurredAt: new Date(String(data.occurred_at)).toISOString(),
    correlationId: String(data.correlation_id ?? ''),
    payload: (data.payload ?? {}) as Record<string, unknown>,
  });
}

export interface PostingLogView {
  id: string;
  eventId: string;
  eventName: string;
  status: LogStatus;
  entryId: string | null;
  reason: string;
  attempts: number;
  reviewedAt: string | null;
  createdAt: string;
}

export interface LogFilter {
  status?: LogStatus;
  /** `pending` = posted by the system and not yet reviewed. */
  review?: 'pending' | 'done';
  limit?: number;
}

export async function listPostingLog(
  companyId: string,
  f: LogFilter = {},
): Promise<PostingLogView[]> {
  let q = getAdminSupabase()
    .from('posting_log')
    .select('id, event_id, event_name, status, entry_id, reason, attempts, reviewed_at, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(f.limit ?? 100, 1), 500));
  if (f.status) q = q.eq('status', f.status);
  if (f.review === 'pending') q = q.eq('status', 'posted').is('reviewed_at', null);
  if (f.review === 'done') q = q.not('reviewed_at', 'is', null);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    eventName: String(r.event_name),
    status: r.status === 'posted' ? 'posted' : r.status === 'failed' ? 'failed' : 'skipped',
    entryId: r.entry_id ? String(r.entry_id) : null,
    reason: String(r.reason ?? ''),
    attempts: Number(r.attempts),
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    createdAt: String(r.created_at),
  }));
}

/** Marks entries of the review queue as checked by the accountant. */
export async function markReviewed(actor: Actor, ids: readonly string[]): Promise<number> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (ids.length === 0) return 0;
  const { data, error } = await getAdminSupabase()
    .from('posting_log')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: actor.userId })
    .eq('company_id', companyId)
    .in('id', [...ids])
    .eq('status', 'posted')
    .is('reviewed_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'accounting.postings_reviewed',
    resourceType: 'posting_log',
    resourceId: null,
    companyId,
    metadata: { count: data?.length ?? 0 },
  });
  return data?.length ?? 0;
}

/** Tries a failed or skipped event again (after the chart or a mapping was fixed). */
export async function retryPosting(actor: Actor, logId: string): Promise<PostingLogView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  const { data, error } = await getAdminSupabase()
    .from('posting_log')
    .select('event_id, status')
    .eq('company_id', companyId)
    .eq('id', logId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if (data.status === 'posted') throw new ValidationError('This event is already posted.');
  await repost(String(data.event_id));
  const rows = await listPostingLog(companyId, { limit: 500 });
  const row = rows.find((r) => r.id === logId);
  if (!row) throw new NotFoundError();
  return row;
}
