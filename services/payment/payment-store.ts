// path: services/payment/payment-store.ts
// Database access for payments, attempts and allocations. Every query names the company; the status guard trigger and
// the unique indexes of S10_001 are the last line of defence.
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { PaymentStatus, PaymentSummary, ProcessorId } from '@/types/contracts';

export const PAYMENT_COLUMNS =
  'id, company_id, invoice_id, client_id, processor_id, mode_id, environment, status, amount, captured_amount, refunded_amount, surcharge_amount, idempotency_key, processor_transaction_id, payment_method, card_identity_id, payer_ip, payer_country, billing_postal_code, three_ds, failure_reason, decline_category, link_id, created_by, authorized_at, captured_at, voided_at, created_at, version';

export interface PaymentRow {
  id: string;
  company_id: string;
  invoice_id: string;
  client_id: string | null;
  processor_id: ProcessorId | null;
  mode_id: string | null;
  environment: 'sandbox' | 'live' | null;
  status: PaymentStatus;
  amount: string;
  captured_amount: string;
  refunded_amount: string;
  surcharge_amount: string;
  idempotency_key: string;
  processor_transaction_id: string | null;
  payment_method: string;
  card_identity_id: string | null;
  payer_ip: string | null;
  payer_country: string | null;
  billing_postal_code: string | null;
  three_ds: Record<string, unknown>;
  failure_reason: string | null;
  decline_category: string | null;
  link_id: string | null;
  created_by: string | null;
  authorized_at: string | null;
  captured_at: string | null;
  voided_at: string | null;
  created_at: string;
  version: number;
}

export const money = (value: unknown): Money => Money.parseRounded(String(value ?? '0'));

export function toSummary(row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    companyId: row.company_id,
    processorId: row.processor_id ?? 'custom',
    status: row.status,
    amount: money(row.amount),
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

export async function findByKey(companyId: string, key: string): Promise<PaymentRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('company_id', companyId)
    .eq('idempotency_key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as PaymentRow | null) ?? null;
}

export async function getRow(companyId: string, id: string): Promise<PaymentRow> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as PaymentRow;
}

/**
 * Finds the payment of a processor transaction. Used by the webhook core, which learns the company only from this
 * row (the pair processor + transaction id is unique); the company is then taken from the row, never from the event.
 */
export async function getRowByTransaction(
  processorId: ProcessorId,
  processorTransactionId: string,
): Promise<PaymentRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('processor_id', processorId)
    .eq('processor_transaction_id', processorTransactionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as PaymentRow | null) ?? null;
}

export async function listRows(
  companyId: string,
  filter: { status?: PaymentStatus; invoiceId?: string; limit: number },
): Promise<PaymentRow[]> {
  let query = getAdminSupabase()
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filter.limit);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.invoiceId) query = query.eq('invoice_id', filter.invoiceId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return (data ?? []) as PaymentRow[];
}

export type InsertOutcome = { row: PaymentRow } | { replay: PaymentRow };

/** Creates the payment. A second open payment on the invoice is a conflict; the same key returns the first payment. */
export async function insertPayment(values: Record<string, unknown>): Promise<InsertOutcome> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .insert(values)
    .select(PAYMENT_COLUMNS)
    .single();
  if (!error) return { row: data as PaymentRow };
  if (error.code === '23505') {
    if (error.message.includes('uq_payments_idempotency')) {
      const first = await findByKey(String(values.company_id), String(values.idempotency_key));
      if (first) return { replay: first };
    }
    throw new ConflictError(
      'A payment is already in progress for this invoice. Please wait a moment.',
    );
  }
  throw new InternalError(error);
}

/** Moves a payment to a new status. Fails with ConflictError when somebody else changed it first. */
export async function transition(
  row: PaymentRow,
  to: PaymentStatus,
  patch: Record<string, unknown> = {},
): Promise<PaymentRow> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .update({ status: to, ...patch })
    .eq('company_id', row.company_id)
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('version', row.version)
    .is('deleted_at', null)
    .select(PAYMENT_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    throw new ConflictError(
      'The payment was changed by another request. Reload and check its state.',
    );
  return data as PaymentRow;
}

/** Changes columns without a status change (identity, transaction id, 3DS result). */
export async function patchPayment(
  row: PaymentRow,
  patch: Record<string, unknown>,
): Promise<PaymentRow> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .update(patch)
    .eq('company_id', row.company_id)
    .eq('id', row.id)
    .eq('version', row.version)
    .is('deleted_at', null)
    .select(PAYMENT_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    throw new ConflictError(
      'The payment was changed by another request. Reload and check its state.',
    );
  return data as PaymentRow;
}

export interface AttemptInput {
  row: PaymentRow;
  action: 'authorize' | 'charge' | 'capture' | 'void' | 'refund' | 'status';
  outcome:
    | 'authorized'
    | 'captured'
    | 'requires_action'
    | 'declined'
    | 'voided'
    | 'refunded'
    | 'pending'
    | 'error'
    | 'blocked';
  declineCategory?: string | null;
  countedFailure?: boolean;
  rawCode?: string | null;
  message?: string | null;
  cardIdentityId?: string | null;
}

export async function addAttempt(input: AttemptInput): Promise<void> {
  const { row } = input;
  const { error } = await getAdminSupabase()
    .from('payment_attempts')
    .insert({
      company_id: row.company_id,
      payment_id: row.id,
      invoice_id: row.invoice_id,
      processor_id: row.processor_id,
      action: input.action,
      outcome: input.outcome,
      decline_category: input.declineCategory ?? null,
      counted_failure: input.countedFailure ?? false,
      raw_code: input.rawCode ? input.rawCode.slice(0, 80) : null,
      message: input.message ? input.message.replace(/[^\x20-\x7e]/g, ' ').slice(0, 300) : null,
      card_identity_id: input.cardIdentityId ?? row.card_identity_id,
      payer_ip: row.payer_ip,
    });
  if (error) throw new InternalError(error);
}

export async function upsertAllocation(row: PaymentRow, amount: Money): Promise<void> {
  const { error } = await getAdminSupabase().from('payment_allocations').upsert(
    {
      company_id: row.company_id,
      payment_id: row.id,
      invoice_id: row.invoice_id,
      amount: amount.toDbString(),
    },
    { onConflict: 'payment_id,invoice_id', ignoreDuplicates: true },
  );
  if (error) throw new InternalError(error);
}
