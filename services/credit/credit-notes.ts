// path: services/credit/credit-notes.ts
// Credit notes. A credit note is made from a sent invoice (all of it, or chosen quantities of chosen lines) with the
// prices, discounts and tax rates that invoice carried. Issuing gives it a gap-free number (series CN) and, by default,
// applies it to the invoice it came from. What is left can be applied to other open invoices of the same client.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { buildCredit, type CreditLine } from '@/lib/credit/build';
import type { CreditApply, CreditCreate, CreditReason } from '@/lib/credit/input';
import { isOpen } from '@/lib/invoice/status';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { logInvoiceEvent } from '@/services/invoice/events';
import { getInvoice, type InvoiceView } from '@/services/invoice/invoices';
import { buildSeller } from '@/services/invoice/seller';
import type { Actor } from '@/types/contracts';

type Row = Record<string, unknown>;
export type { CreditLine };
export const CREDIT_PREFIX = 'CN-';

export interface CreditNoteView {
  id: string;
  number: string | null;
  status: 'draft' | 'issued' | 'void';
  clientId: string | null;
  walkInName: string;
  invoiceId: string;
  reason: CreditReason;
  reasonNote: string;
  issueDate: string;
  billTo: InvoiceView['billTo'];
  seller: Record<string, unknown> | null;
  lines: CreditLine[];
  taxBreakdown: InvoiceView['taxBreakdown'];
  subtotal: string;
  taxTotal: string;
  total: string;
  appliedAmount: string;
  balance: string;
  returnToStock: boolean;
  voidReason: string;
  version: number;
  createdAt: string;
  deletedAt: string | null;
}

const COLUMNS =
  'id, number, status, client_id, walk_in_name, invoice_id, reason, reason_note, issue_date, bill_to, seller, lines, tax_breakdown, subtotal, tax_total, total, applied_amount, return_to_stock, void_reason, version, created_at, deleted_at';
const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export function toCreditView(r: Row): CreditNoteView {
  const total = Money.parseRounded(String(r.total));
  const applied = Money.parseRounded(String(r.applied_amount));
  const status = String(r.status) as CreditNoteView['status'];
  return {
    id: String(r.id),
    number: r.number ? String(r.number) : null,
    status,
    clientId: r.client_id ? String(r.client_id) : null,
    walkInName: String(r.walk_in_name ?? ''),
    invoiceId: String(r.invoice_id),
    reason: String(r.reason) as CreditReason,
    reasonNote: String(r.reason_note ?? ''),
    issueDate: String(r.issue_date),
    billTo: r.bill_to as CreditNoteView['billTo'],
    seller: (r.seller as Record<string, unknown> | null) ?? null,
    lines: (r.lines as CreditLine[]) ?? [],
    taxBreakdown: (r.tax_breakdown as CreditNoteView['taxBreakdown']) ?? [],
    subtotal: dec(r.subtotal),
    taxTotal: dec(r.tax_total),
    total: total.toDbString(),
    appliedAmount: applied.toDbString(),
    balance: status === 'issued' ? total.sub(applied).toDbString() : '0.0000',
    returnToStock: r.return_to_stock === true,
    voidReason: String(r.void_reason ?? ''),
    version: toInt(r.version, 1),
    createdAt: String(r.created_at),
    deletedAt: r.deleted_at ? String(r.deleted_at) : null,
  };
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function getCreditNote(companyId: string, id: string): Promise<CreditNoteView> {
  const { data, error } = await getAdminSupabase()
    .from('credit_notes')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toCreditView(data as unknown as Row);
}

export async function listCreditNotes(
  companyId: string,
  filter: { invoiceId?: string; clientId?: string; limit: number },
): Promise<CreditNoteView[]> {
  let q = getAdminSupabase()
    .from('credit_notes')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (filter.invoiceId) q = q.eq('invoice_id', filter.invoiceId);
  if (filter.clientId) q = q.eq('client_id', filter.clientId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(filter.limit);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toCreditView(r as unknown as Row));
}

/** Quantity already credited per line position by credit notes that are not void. */
async function creditedQuantities(
  companyId: string,
  invoiceId: string,
): Promise<Map<number, Money>> {
  const { data, error } = await getAdminSupabase()
    .from('credit_notes')
    .select('lines')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .in('status', ['draft', 'issued'])
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const out = new Map<number, Money>();
  for (const row of data ?? [])
    for (const l of (row.lines as CreditLine[]) ?? [])
      out.set(l.position, (out.get(l.position) ?? Money.zero()).add(l.quantity));
  return out;
}

export async function createCreditNote(
  actor: Actor,
  invoiceId: string,
  input: CreditCreate,
): Promise<CreditNoteView> {
  const companyId = need(actor);
  const invoice = await getInvoice(companyId, invoiceId);
  if (invoice.kind !== 'invoice' && invoice.kind !== 'debit_note')
    throw new ValidationError('A credit note can be written for an invoice or a debit note.');
  if (
    invoice.status === 'draft' ||
    invoice.status === 'pending_approval' ||
    invoice.status === 'void'
  )
    throw new ValidationError('Credit notes are written for invoices that were sent.');
  const built = buildCredit(invoice, input, await creditedQuantities(companyId, invoiceId));
  if (!Money.parse(built.total).isPositive())
    throw new ValidationError('The credit must be above zero.');
  const { data, error } = await getAdminSupabase()
    .from('credit_notes')
    .insert({
      company_id: companyId,
      client_id: invoice.clientId,
      walk_in_name: invoice.walkInName,
      invoice_id: invoiceId,
      reason: input.reason,
      reason_note: input.reasonNote,
      bill_to: invoice.billTo,
      options: built.options,
      lines: built.lines,
      tax_breakdown: built.taxBreakdown,
      subtotal: built.subtotal,
      tax_total: built.taxTotal,
      total: built.total,
      return_to_stock: input.returnToStock,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  const view = toCreditView(data as unknown as Row);
  await logInvoiceEvent(
    companyId,
    invoiceId,
    'credit_draft',
    `Credit note draft for ${view.total}`,
    actor.userId,
    {
      creditNoteId: view.id,
    },
  );
  await getService('audit').record({
    action: 'credit_note.created',
    resourceType: 'credit_note',
    resourceId: view.id,
    companyId,
    metadata: { invoiceId, by: actor.userId, total: view.total },
  });
  return view;
}

export async function trashCreditNote(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const c = await getCreditNote(companyId, id);
  if (c.status !== 'draft') throw new ValidationError('Only a draft can be deleted.');
  const r = await getAdminSupabase()
    .from('credit_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  await getService('audit').record({
    action: 'credit_note.deleted',
    resourceType: 'credit_note',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export interface IssueResult {
  creditNote: CreditNoteView;
  /** Amount applied to the original invoice at once ("0.0000" when none). */
  applied: string;
}

export async function issueCreditNote(
  actor: Actor,
  id: string,
  autoApply: boolean,
): Promise<IssueResult> {
  const companyId = need(actor);
  const draft = await getCreditNote(companyId, id);
  if (draft.status !== 'draft') throw new ValidationError('This credit note was already issued.');
  const s = (await getSection(companyId, 'invoice')).value;
  const seller = await buildSeller(companyId);
  const { error } = await getAdminSupabase().rpc('kd_credit_issue', {
    p_company: companyId,
    p_credit: id,
    p_prefix: CREDIT_PREFIX,
    p_yearly: s.numbering === 'yearly',
    p_padding: s.padding,
    p_start: s.nextNumber,
    p_year: new Date().getUTCFullYear(),
    p_seller: seller,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError(issueMessage(error.message));
    throw new InternalError(error);
  }
  const issued = await getCreditNote(companyId, id);
  await logInvoiceEvent(
    companyId,
    issued.invoiceId,
    'credit_issued',
    `Credit note ${issued.number ?? ''} for ${issued.total}`,
    actor.userId,
    { creditNoteId: id },
  );
  await getService('audit').record({
    action: 'credit_note.issued',
    resourceType: 'credit_note',
    resourceId: id,
    companyId,
    metadata: { number: issued.number, total: issued.total, by: actor.userId },
  });
  let applied = Money.zero();
  if (autoApply) {
    const invoice = await getInvoice(companyId, issued.invoiceId);
    const balance = Money.parse(invoice.balance);
    if (isOpen(invoice.status) && balance.isPositive()) {
      const amount = Money.min(balance, Money.parse(issued.total));
      await applyCredit(actor, {
        sourceType: 'credit_note',
        sourceId: id,
        invoiceId: issued.invoiceId,
        amount: amount.toDbString(),
      });
      applied = amount;
    }
  }
  return { creditNote: await getCreditNote(companyId, id), applied: applied.toDbString() };
}

function issueMessage(raw: string): string {
  if (raw.includes('more than the invoice'))
    return 'The credit notes for this invoice would be more than the invoice total.';
  if (raw.includes('not sent')) return 'The invoice is not open for a credit note.';
  return 'This credit note cannot be issued now.';
}

/** Applies a credit note or a paid deposit to an open invoice of the same client; counts as a payment. */
export async function applyCredit(
  actor: Actor,
  input: CreditApply,
): Promise<{ status: string; balance: string }> {
  const companyId = need(actor);
  const before = await getInvoice(companyId, input.invoiceId);
  const { data, error } = await getAdminSupabase().rpc('kd_credit_apply', {
    p_company: companyId,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_invoice: input.invoiceId,
    p_amount: Money.parse(input.amount).toDbString(),
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError(applyMessage(error.message));
    throw new InternalError(error);
  }
  const row = (
    data as { application_id: string; invoice_status: string; balance: string }[] | null
  )?.[0];
  if (!row) throw new InternalError(new Error('Credit result missing.'));
  const balance = Money.parseRounded(String(row.balance)).toDbString();
  await logInvoiceEvent(
    companyId,
    input.invoiceId,
    'credit_applied',
    `${input.sourceType === 'deposit' ? 'Deposit' : 'Credit'} of ${Money.parse(input.amount).toDbString()} applied`,
    actor.userId,
    { sourceType: input.sourceType, sourceId: input.sourceId, applicationId: row.application_id },
  );
  await getService('events').publish({
    name: row.invoice_status === 'paid' ? 'invoice.paid' : 'invoice.partially_paid',
    companyId,
    payload: {
      invoiceId: input.invoiceId,
      number: before.number,
      paymentId: row.application_id,
      amount: Money.parse(input.amount).toDbString(),
      balance,
      source: input.sourceType,
    },
  });
  await getService('audit').record({
    action: 'credit.applied',
    resourceType: 'invoice',
    resourceId: input.invoiceId,
    companyId,
    metadata: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount: input.amount,
      by: actor.userId,
    },
  });
  return { status: row.invoice_status, balance };
}

function applyMessage(raw: string): string {
  if (raw.includes('another client')) return 'This credit belongs to another client.';
  if (raw.includes('credit left') || raw.includes('deposit left'))
    return 'The amount is more than what is left of the credit.';
  if (raw.includes('more than the balance'))
    return 'The amount is more than the balance of the invoice.';
  if (raw.includes('not in a state') || raw.includes('cannot receive'))
    return 'The invoice is not open for payment.';
  if (raw.includes('not issued')) return 'The credit note is not issued.';
  if (raw.includes('not paid')) return 'The deposit is not paid yet.';
  return 'The credit cannot be applied.';
}

export async function voidCreditNote(
  actor: Actor,
  id: string,
  reason: string,
): Promise<CreditNoteView> {
  const companyId = need(actor);
  const { error } = await getAdminSupabase().rpc('kd_credit_void', {
    p_company: companyId,
    p_credit: id,
    p_reason: reason,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        error.message.includes('applied')
          ? 'This credit note was already applied to an invoice and cannot be voided.'
          : 'Only an issued credit note can be voided.',
      );
    if (error.code === 'P0002') throw new NotFoundError();
    throw new InternalError(error);
  }
  const view = await getCreditNote(companyId, id);
  await logInvoiceEvent(
    companyId,
    view.invoiceId,
    'credit_voided',
    `Credit note ${view.number ?? ''} voided`,
    actor.userId,
  );
  await getService('audit').record({
    action: 'credit_note.voided',
    resourceType: 'credit_note',
    resourceId: id,
    companyId,
    metadata: { reason, by: actor.userId },
  });
  return view;
}

export interface AppliedCredit {
  id: string;
  sourceType: 'credit_note' | 'deposit';
  sourceId: string;
  invoiceId: string;
  amount: string;
  createdAt: string;
}

/** Applications of credits and deposits, for one invoice (what reduced it) or one source (where it went). */
export async function listApplications(
  companyId: string,
  filter: { invoiceId?: string; sourceId?: string },
): Promise<AppliedCredit[]> {
  let q = getAdminSupabase()
    .from('credit_applications')
    .select('id, source_type, source_id, invoice_id, amount, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (filter.invoiceId) q = q.eq('invoice_id', filter.invoiceId);
  if (filter.sourceId) q = q.eq('source_id', filter.sourceId);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    sourceType: String(r.source_type) as AppliedCredit['sourceType'],
    sourceId: String(r.source_id),
    invoiceId: String(r.invoice_id),
    amount: dec(r.amount),
    createdAt: String(r.created_at),
  }));
}

export interface AvailableCredit {
  sourceType: 'credit_note' | 'deposit';
  sourceId: string;
  number: string;
  left: string;
}

/** Credit notes and paid deposits of the invoice's client that still have an amount left. */
export async function availableCredits(
  companyId: string,
  invoiceId: string,
): Promise<AvailableCredit[]> {
  const invoice = await getInvoice(companyId, invoiceId);
  if (!invoice.clientId) return [];
  const admin = getAdminSupabase();
  const [notes, deposits] = await Promise.all([
    admin
      .from('credit_notes')
      .select('id, number, total, applied_amount')
      .eq('company_id', companyId)
      .eq('client_id', invoice.clientId)
      .eq('status', 'issued')
      .is('deleted_at', null)
      .limit(200),
    admin
      .from('invoices')
      .select('id, number, amount_paid')
      .eq('company_id', companyId)
      .eq('client_id', invoice.clientId)
      .eq('kind', 'deposit')
      .in('status', ['partially_paid', 'paid'])
      .is('deleted_at', null)
      .neq('id', invoiceId)
      .limit(200),
  ]);
  if (notes.error) throw new InternalError(notes.error);
  if (deposits.error) throw new InternalError(deposits.error);
  const out: AvailableCredit[] = [];
  for (const n of notes.data ?? []) {
    const left = Money.parseRounded(String(n.total)).sub(String(n.applied_amount));
    if (left.isPositive())
      out.push({
        sourceType: 'credit_note',
        sourceId: String(n.id),
        number: String(n.number ?? ''),
        left: left.toDbString(),
      });
  }
  if ((deposits.data ?? []).length > 0) {
    const used = await admin
      .from('credit_applications')
      .select('source_id, amount')
      .eq('company_id', companyId)
      .eq('source_type', 'deposit')
      .in(
        'source_id',
        (deposits.data ?? []).map((d) => String(d.id)),
      )
      .is('deleted_at', null);
    if (used.error) throw new InternalError(used.error);
    const spent = new Map<string, Money>();
    for (const u of used.data ?? [])
      spent.set(
        String(u.source_id),
        (spent.get(String(u.source_id)) ?? Money.zero()).add(String(u.amount)),
      );
    for (const d of deposits.data ?? []) {
      const left = Money.parseRounded(String(d.amount_paid)).sub(
        spent.get(String(d.id)) ?? Money.zero(),
      );
      if (left.isPositive())
        out.push({
          sourceType: 'deposit',
          sourceId: String(d.id),
          number: String(d.number ?? ''),
          left: left.toDbString(),
        });
    }
  }
  return out;
}
