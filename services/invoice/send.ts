// path: services/invoice/send.ts
// Sending an invoice. The owner sends at once; a staff member's invoice waits for the owner's approval (approval rule
// "invoice.send"). Sending gives the invoice its number, freezes the seller block, locks the invoice, issues the client
// link, e-mails the client and publishes `invoice.sent`. Two near-identical invoices are warned about before sending.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { invoiceLink } from '@/lib/billing/links';
import { FIXED_PREFIX } from '@/lib/invoice/numbering';
import type { InvoiceKind } from '@/lib/invoice/input';
import { isOpen } from '@/lib/invoice/status';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import type { Actor } from '@/types/contracts';
import { logInvoiceEvent } from './events';
import { getInvoice, type InvoiceView } from './invoices';
import { buildSeller } from './seller';

export interface SimilarInvoice {
  id: string;
  number: string | null;
  status: string;
  issueDate: string;
  total: string;
}

/** Invoices of the same type for the same client (or walk-in name) with the same total and issue date. */
export async function findSimilarInvoices(
  companyId: string,
  id: string,
): Promise<SimilarInvoice[]> {
  const admin = getAdminSupabase();
  const current = await admin
    .from('invoices')
    .select('duplicate_hash')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (current.error) throw new InternalError(current.error);
  if (!current.data) throw new NotFoundError();
  const hash = String(current.data.duplicate_hash ?? '');
  if (hash === '') return [];
  const { data, error } = await admin
    .from('invoices')
    .select('id, number, status, issue_date, total')
    .eq('company_id', companyId)
    .eq('duplicate_hash', hash)
    .neq('id', id)
    .neq('status', 'void')
    .is('deleted_at', null)
    .limit(5);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    number: r.number ? String(r.number) : null,
    status: String(r.status),
    issueDate: String(r.issue_date),
    total: Money.parseRounded(String(r.total)).toDbString(),
  }));
}

async function numberingRules(
  companyId: string,
  kind: InvoiceKind,
): Promise<{ prefix: string; yearly: boolean; padding: number; start: number }> {
  const s = (await getSection(companyId, 'invoice')).value;
  return {
    prefix: kind === 'invoice' ? s.invoicePrefix : FIXED_PREFIX[kind],
    yearly: s.numbering === 'yearly',
    padding: s.padding,
    start: s.nextNumber,
  };
}

function eventLines(
  v: InvoiceView,
): { productId: string; variantId: string | null; quantity: string }[] {
  return v.lines.flatMap((l) =>
    l.productId && !Money.parse(l.quantity).isNegative() && !Money.parse(l.quantity).isZero()
      ? [{ productId: l.productId, variantId: l.variantId, quantity: l.quantity }]
      : [],
  );
}

/** The work of sending, after the checks: number, seller block and status in one database transaction. */
async function finalizeSend(
  companyId: string,
  id: string,
  by: string,
  approvedBy: string | null,
): Promise<InvoiceView> {
  const before = await getInvoice(companyId, id);
  const rules = await numberingRules(companyId, before.kind);
  const seller = await buildSeller(companyId);
  const { data, error } = await getAdminSupabase().rpc('kd_invoice_send', {
    p_company: companyId,
    p_invoice: id,
    p_prefix: rules.prefix,
    p_yearly: rules.yearly,
    p_padding: rules.padding,
    p_start: rules.start,
    p_year: new Date().getUTCFullYear(),
    p_seller: seller,
    p_by: by,
    p_approved_by: approvedBy,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError(sendMessage(error.message));
    if (error.code === '23505') throw new DuplicateError('This invoice number is already used.');
    throw new InternalError(error);
  }
  const sent = await getInvoice(companyId, id);
  const row = (data as { number: string; status: string }[] | null)?.[0];
  await logInvoiceEvent(
    companyId,
    id,
    'sent',
    `Invoice ${row?.number ?? sent.number ?? ''} sent`,
    by,
    {
      approvedBy,
    },
  );
  await getService('events').publish({
    name: 'invoice.sent',
    companyId,
    payload: {
      invoiceId: id,
      number: sent.number,
      clientId: sent.clientId,
      total: sent.totals.total,
      amountDue: sent.totals.amountDue,
      dueDate: sent.dueDate,
      lines: eventLines(sent),
    },
  });
  if (sent.status === 'paid')
    await getService('events').publish({
      name: 'invoice.paid',
      companyId,
      payload: { invoiceId: id, number: sent.number, total: sent.totals.total },
    });
  await getService('audit').record({
    action: 'invoice.sent',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { number: sent.number, by, approvedBy },
  });
  return sent;
}

function sendMessage(raw: string): string {
  if (raw.includes('no lines')) return 'Add at least one line before sending.';
  if (raw.includes('no client')) return 'Choose a client or enter a customer name before sending.';
  if (raw.includes('postal code'))
    return 'The billing postal code and country are needed before sending.';
  if (raw.includes('below zero'))
    return 'An invoice cannot have a negative total. Write a credit note instead.';
  if (raw.includes('already sent')) return 'This invoice was already sent.';
  return 'This invoice cannot be sent now.';
}

/** Emails the client the link to the invoice. A missing e-mail address is not an error: the invoice is still sent. */
async function notifyClient(companyId: string, v: InvoiceView, message: string): Promise<boolean> {
  const to = v.billTo.email;
  if (!to) return false;
  const tokens = getService('tokens');
  const issued = await tokens.issue({ docType: 'invoice', docId: v.id, companyId, ttlDays: 90 });
  const seller = (v.seller ?? {}) as { name?: string };
  await getService('email').send({
    template: 'invoice.sent',
    to,
    companyId,
    data: {
      clientName: v.billTo.name || v.walkInName,
      companyName: seller.name ?? '',
      number: v.number ?? '',
      amountDue: formatMoney(Money.parse(v.totals.amountDue)),
      dueDate: v.dueDate,
      message,
      link: invoiceLink(issued.token),
    },
    idempotencyKey: `invoice-sent-${v.id}`,
  });
  await logInvoiceEvent(companyId, v.id, 'emailed', `Link sent to ${to}`, null);
  return true;
}

export interface SendResult {
  invoice: InvoiceView;
  /** "sent" when the invoice went out now, "waiting" when it waits for the owner's approval. */
  outcome: 'sent' | 'waiting';
  emailed: boolean;
}

export async function sendInvoice(
  actor: Actor,
  id: string,
  options: { confirmDuplicate: boolean; message: string },
): Promise<SendResult> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const current = await getInvoice(companyId, id);
  if (current.status !== 'draft' && current.status !== 'pending_approval')
    throw new ValidationError('This invoice was already sent.');
  if (!options.confirmDuplicate) {
    const similar = await findSimilarInvoices(companyId, id);
    if (similar.length > 0)
      throw new DuplicateError(
        'A similar invoice already exists (same client, total and date). Check it, or confirm to send anyway.',
        similar,
      );
  }
  if (actor.role !== 'owner') {
    if (current.status === 'pending_approval')
      throw new ValidationError('This invoice is already waiting for approval.');
    const state = await getService('approval').request({
      action: 'invoice.send',
      payload: { invoiceId: id, message: options.message },
      requesterId: actor.userId,
      companyId,
    });
    const r = await getAdminSupabase()
      .from('invoices')
      .update({
        status: 'pending_approval',
        approval_request_id: state.requestId,
        rejected_reason: '',
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .eq('version', current.version)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
    await logInvoiceEvent(companyId, id, 'submitted', 'Submitted for approval', actor.userId);
    await getService('audit').record({
      action: 'invoice.submitted',
      resourceType: 'invoice',
      resourceId: id,
      companyId,
      metadata: { by: actor.userId },
    });
    return { invoice: await getInvoice(companyId, id), outcome: 'waiting', emailed: false };
  }
  const sent = await finalizeSend(companyId, id, actor.userId, actor.userId);
  const emailed = await notifyClient(companyId, sent, options.message).catch(() => false);
  return { invoice: sent, outcome: 'sent', emailed };
}

/** Staff: take back an invoice that waits for approval. */
export async function withdrawInvoice(actor: Actor, id: string): Promise<InvoiceView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const current = await getInvoice(companyId, id);
  if (current.status !== 'pending_approval')
    throw new ValidationError('Only an invoice that waits for approval can be taken back.');
  const r = await getAdminSupabase()
    .from('invoices')
    .update({ status: 'draft', approval_request_id: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'pending_approval')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logInvoiceEvent(companyId, id, 'withdrawn', 'Taken back from approval', actor.userId);
  return getInvoice(companyId, id);
}

/** Job: applies the owner's decision on invoices that staff submitted (every few minutes). */
export async function syncInvoiceApprovals(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('invoices')
    .select('id, company_id, approval_request_id, created_by')
    .eq('status', 'pending_approval')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .limit(50);
  if (error) throw new InternalError(error);
  let changed = 0;
  for (const row of data ?? []) {
    const state = await getService('approval')
      .status(String(row.approval_request_id))
      .catch(() => null);
    if (!state || state.status === 'pending' || state.status === 'escalated') continue;
    const id = String(row.id);
    const companyId = String(row.company_id);
    if (state.status === 'approved') {
      try {
        const by = String(row.created_by ?? '');
        const sent = await finalizeSend(companyId, id, by, by);
        await notifyClient(companyId, sent, '').catch(() => false);
        changed += 1;
      } catch {
        await admin
          .from('invoices')
          .update({
            status: 'draft',
            rejected_reason:
              'The invoice could not be sent after approval. Check it and send again.',
          })
          .eq('id', id)
          .eq('company_id', companyId)
          .eq('status', 'pending_approval');
      }
    } else {
      const r = await admin
        .from('invoices')
        .update({ status: 'draft', rejected_reason: `The approval ended as ${state.status}.` })
        .eq('id', id)
        .eq('company_id', companyId)
        .eq('status', 'pending_approval')
        .select('id');
      if (!r.error && r.data && r.data.length > 0) {
        await logInvoiceEvent(companyId, id, 'rejected', `Not approved (${state.status})`, null);
        changed += 1;
      }
    }
  }
  return changed;
}

/** Void a sent invoice (owner). Stock taken for it is given back by the inventory worker through `invoice.voided`. */
export async function voidInvoice(actor: Actor, id: string, reason: string): Promise<InvoiceView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  if (actor.role !== 'owner') throw new ForbiddenError();
  const companyId = actor.companyId;
  const current = await getInvoice(companyId, id);
  if (current.status === 'void') throw new ValidationError('This invoice is already void.');
  if (current.status === 'paid')
    throw new ValidationError('A paid invoice cannot be voided. Write a credit note.');
  const allowed =
    current.status === 'draft' || isOpen(current.status) || current.status === 'pending_approval';
  if (!allowed) throw new ValidationError('This invoice cannot be voided now.');
  const r = await getAdminSupabase()
    .from('invoices')
    .update({ status: 'void', voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logInvoiceEvent(companyId, id, 'voided', `Voided: ${reason}`, actor.userId);
  const voided = await getInvoice(companyId, id);
  if (current.number)
    await getService('events').publish({
      name: 'invoice.voided',
      companyId,
      payload: {
        invoiceId: id,
        number: voided.number,
        amountPaid: voided.amountPaid,
        lines: eventLines(voided),
      },
    });
  await getService('audit').record({
    action: 'invoice.voided',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { reason, partiallyPaid: !Money.parse(voided.amountPaid).isZero(), by: actor.userId },
  });
  return voided;
}
