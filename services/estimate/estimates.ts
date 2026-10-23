// path: services/estimate/estimates.ts
// Estimates (quotes). Written with the invoice form, sent with a gap-free number (series EST) and a client link,
// accepted or declined by the client, and converted to a draft invoice that keeps the same lines and totals.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  ESTIMATE_PREFIX,
  canConvert,
  canRevise,
  canVoid,
  type EstimateStatus,
} from '@/lib/estimate/status';
import { estimateLink } from '@/lib/billing/links';
import { dueDateFor } from '@/lib/invoice/terms';
import type { InvoiceInput } from '@/lib/invoice/input';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { createInvoice, type InvoiceView } from '@/services/invoice/invoices';
import { prepareInvoice } from '@/services/invoice/prepare';
import { buildSeller } from '@/services/invoice/seller';
import type { Actor } from '@/types/contracts';

type Row = Record<string, unknown>;

export interface EstimateView {
  id: string;
  number: string | null;
  status: EstimateStatus;
  clientId: string | null;
  walkInName: string;
  clientName: string;
  input: InvoiceInput;
  subtotal: string;
  taxTotal: string;
  total: string;
  validUntil: string;
  seller: Record<string, unknown> | null;
  sentAt: string | null;
  viewedAt: string | null;
  decidedAt: string | null;
  decisionNote: string;
  signerName: string;
  signatureHash: string | null;
  convertedInvoiceId: string | null;
  voidReason: string;
  version: number;
  createdAt: string;
  deletedAt: string | null;
}

export const ESTIMATE_COLUMNS =
  'id, number, status, client_id, walk_in_name, input, subtotal, tax_total, total, valid_until, seller, sent_at, viewed_at, decided_at, decision_note, signer_name, signature_hash, converted_invoice_id, void_reason, version, created_at, deleted_at';

export function toEstimateView(r: Row): EstimateView {
  const input = r.input as InvoiceInput;
  return {
    id: String(r.id),
    number: r.number ? String(r.number) : null,
    status: String(r.status) as EstimateStatus,
    clientId: r.client_id ? String(r.client_id) : null,
    walkInName: String(r.walk_in_name ?? ''),
    clientName: input.billTo?.name || String(r.walk_in_name ?? ''),
    input,
    subtotal: Money.parseRounded(String(r.subtotal)).toDbString(),
    taxTotal: Money.parseRounded(String(r.tax_total)).toDbString(),
    total: Money.parseRounded(String(r.total)).toDbString(),
    validUntil: String(r.valid_until),
    seller: (r.seller as Record<string, unknown> | null) ?? null,
    sentAt: r.sent_at ? String(r.sent_at) : null,
    viewedAt: r.viewed_at ? String(r.viewed_at) : null,
    decidedAt: r.decided_at ? String(r.decided_at) : null,
    decisionNote: String(r.decision_note ?? ''),
    signerName: String(r.signer_name ?? ''),
    signatureHash: r.signature_hash ? String(r.signature_hash) : null,
    convertedInvoiceId: r.converted_invoice_id ? String(r.converted_invoice_id) : null,
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

export async function logEstimateEvent(
  companyId: string,
  estimateId: string,
  kind: string,
  message: string,
  actorId: string | null,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('estimate_events')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      kind,
      message: message.slice(0, 500),
      actor_id: actorId,
    });
  if (error) throw new InternalError(error);
}

export interface EstimateEventView {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
}

export async function listEstimateEvents(
  companyId: string,
  estimateId: string,
): Promise<EstimateEventView[]> {
  const { data, error } = await getAdminSupabase()
    .from('estimate_events')
    .select('id, kind, message, created_at')
    .eq('company_id', companyId)
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    message: String(r.message),
    createdAt: String(r.created_at),
  }));
}

export async function getEstimate(
  companyId: string,
  id: string,
  options: { includeTrashed?: boolean } = {},
): Promise<EstimateView> {
  let q = getAdminSupabase()
    .from('estimates')
    .select(ESTIMATE_COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId);
  if (!options.includeTrashed) q = q.is('deleted_at', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toEstimateView(data as unknown as Row);
}

export interface EstimateListQuery {
  status: EstimateStatus | null;
  q: string;
  trashed: boolean;
  limit: number;
}

export async function listEstimates(
  companyId: string,
  query: EstimateListQuery,
): Promise<EstimateView[]> {
  let q = getAdminSupabase().from('estimates').select(ESTIMATE_COLUMNS).eq('company_id', companyId);
  q = query.trashed ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
  if (query.status) q = q.eq('status', query.status);
  const text = query.q.replace(/[^\p{L}\p{N} .-]/gu, ' ').trim();
  if (text !== '')
    q = q.or(
      `number.ilike.%${text}%,walk_in_name.ilike.%${text}%,input->billTo->>name.ilike.%${text}%`,
    );
  const { data, error } = await q.order('created_at', { ascending: false }).limit(query.limit);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toEstimateView(r as unknown as Row));
}

async function totalsOf(
  companyId: string,
  input: InvoiceInput,
): Promise<{ subtotal: string; tax_total: string; total: string }> {
  const p = await prepareInvoice(companyId, input);
  return { subtotal: p.result.subtotal, tax_total: p.result.taxTotal, total: p.result.total };
}

function headerOf(input: InvoiceInput): Record<string, unknown> {
  return {
    client_id: input.clientId,
    walk_in_name: input.walkInName,
    valid_until: input.dueDate,
    input: { ...input, kind: 'invoice' },
  };
}

export async function createEstimate(actor: Actor, input: InvoiceInput): Promise<EstimateView> {
  const companyId = need(actor);
  if (input.clientId) await getService('clients').getById(input.clientId);
  const totals = await totalsOf(companyId, input);
  const { data, error } = await getAdminSupabase()
    .from('estimates')
    .insert({ company_id: companyId, created_by: actor.userId, ...headerOf(input), ...totals })
    .select(ESTIMATE_COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  const view = toEstimateView(data as unknown as Row);
  await logEstimateEvent(companyId, view.id, 'created', 'Draft created', actor.userId);
  await getService('audit').record({
    action: 'estimate.created',
    resourceType: 'estimate',
    resourceId: view.id,
    companyId,
    metadata: { by: actor.userId },
  });
  return view;
}

export async function updateEstimate(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: InvoiceInput,
): Promise<EstimateView> {
  const companyId = need(actor);
  const current = await getEstimate(companyId, id);
  if (current.status !== 'draft')
    throw new ValidationError('A sent estimate cannot be changed. Take it back to a draft first.');
  if (input.clientId) await getService('clients').getById(input.clientId);
  const totals = await totalsOf(companyId, input);
  const { data, error } = await getAdminSupabase()
    .from('estimates')
    .update({ ...headerOf(input), ...totals, version: expectedVersion + 1 })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select(ESTIMATE_COLUMNS);
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await getService('audit').record({
    action: 'estimate.updated',
    resourceType: 'estimate',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return toEstimateView(data[0] as unknown as Row);
}

export async function trashEstimate(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const current = await getEstimate(companyId, id);
  if (current.status !== 'draft')
    throw new ValidationError('Only a draft can be deleted. Void it instead.');
  const r = await getAdminSupabase()
    .from('estimates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  await logEstimateEvent(companyId, id, 'deleted', 'Moved to the trash', actor.userId);
  await getService('audit').record({
    action: 'estimate.deleted',
    resourceType: 'estimate',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export async function restoreEstimate(actor: Actor, id: string): Promise<EstimateView> {
  const companyId = need(actor);
  await getEstimate(companyId, id, { includeTrashed: true });
  const r = await getAdminSupabase()
    .from('estimates')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .not('deleted_at', 'is', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  await logEstimateEvent(companyId, id, 'restored', 'Restored from the trash', actor.userId);
  return getEstimate(companyId, id);
}

async function numberingRules(
  companyId: string,
): Promise<{ yearly: boolean; padding: number; start: number }> {
  const s = (await getSection(companyId, 'invoice')).value;
  return { yearly: s.numbering === 'yearly', padding: s.padding, start: s.nextNumber };
}

export interface EstimateSendResult {
  estimate: EstimateView;
  emailed: boolean;
}

export async function sendEstimate(
  actor: Actor,
  id: string,
  message: string,
): Promise<EstimateSendResult> {
  const companyId = need(actor);
  const current = await getEstimate(companyId, id);
  if (current.status !== 'draft') throw new ValidationError('This estimate was already sent.');
  const rules = await numberingRules(companyId);
  const seller = await buildSeller(companyId);
  const { data, error } = await getAdminSupabase().rpc('kd_estimate_send', {
    p_company: companyId,
    p_estimate: id,
    p_prefix: ESTIMATE_PREFIX,
    p_yearly: rules.yearly,
    p_padding: rules.padding,
    p_start: rules.start,
    p_year: new Date().getUTCFullYear(),
    p_seller: seller,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError(sendMessage(error.message));
    throw new InternalError(error);
  }
  const sent = await getEstimate(companyId, id);
  await logEstimateEvent(
    companyId,
    id,
    'sent',
    `Estimate ${String(data ?? '')} sent`,
    actor.userId,
  );
  await getService('events').publish({
    name: 'estimate.sent',
    companyId,
    payload: { estimateId: id, number: sent.number, clientId: sent.clientId, total: sent.total },
  });
  await getService('audit').record({
    action: 'estimate.sent',
    resourceType: 'estimate',
    resourceId: id,
    companyId,
    metadata: { number: sent.number, by: actor.userId },
  });
  const emailed = await notifyClient(companyId, sent, message).catch(() => false);
  return { estimate: sent, emailed };
}

function sendMessage(raw: string): string {
  if (raw.includes('no lines')) return 'Add at least one line before sending.';
  if (raw.includes('no client')) return 'Choose a client or enter a customer name before sending.';
  if (raw.includes('expired')) return 'The valid-until date has passed. Choose a later date.';
  return 'This estimate cannot be sent now.';
}

async function notifyClient(companyId: string, e: EstimateView, message: string): Promise<boolean> {
  const to = e.input.billTo.email;
  if (!to) return false;
  const issued = await getService('tokens').issue({
    docType: 'estimate',
    docId: e.id,
    companyId,
    ttlDays: 90,
  });
  const seller = (e.seller ?? {}) as { name?: string };
  await getService('email').send({
    template: 'estimate.sent',
    to,
    companyId,
    data: {
      clientName: e.clientName,
      companyName: seller.name ?? '',
      number: e.number ?? '',
      total: formatMoney(Money.parse(e.total)),
      validUntil: e.validUntil,
      message,
      link: estimateLink(issued.token),
    },
    idempotencyKey: `estimate-sent-${e.id}`,
  });
  await logEstimateEvent(companyId, e.id, 'emailed', `Link sent to ${to}`, null);
  return true;
}

/** Takes a sent estimate back to a draft so it can be changed (not after the client decided). */
export async function reviseEstimate(actor: Actor, id: string): Promise<EstimateView> {
  const companyId = need(actor);
  const current = await getEstimate(companyId, id);
  if (!canRevise(current.status))
    throw new ValidationError('Only an estimate the client has not decided can be changed.');
  const r = await getAdminSupabase()
    .from('estimates')
    .update({ status: 'draft', viewed_at: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .in('status', ['sent', 'viewed', 'expired'])
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logEstimateEvent(companyId, id, 'revised', 'Taken back to a draft', actor.userId);
  return getEstimate(companyId, id);
}

export async function voidEstimate(
  actor: Actor,
  id: string,
  reason: string,
): Promise<EstimateView> {
  const companyId = need(actor);
  const current = await getEstimate(companyId, id);
  if (!canVoid(current.status)) throw new ValidationError('This estimate cannot be voided.');
  const r = await getAdminSupabase()
    .from('estimates')
    .update({ status: 'void', void_reason: reason })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logEstimateEvent(companyId, id, 'voided', `Voided: ${reason}`, actor.userId);
  await getService('audit').record({
    action: 'estimate.voided',
    resourceType: 'estimate',
    resourceId: id,
    companyId,
    metadata: { reason, by: actor.userId },
  });
  return getEstimate(companyId, id);
}

export interface ConvertResult {
  invoice: InvoiceView;
  /** True when a tax rate changed since the estimate was written, so the invoice total differs. */
  totalsChanged: boolean;
}

/** An accepted estimate becomes a draft invoice with the same client, lines, taxes and notes. */
export async function convertEstimate(actor: Actor, id: string): Promise<ConvertResult> {
  const companyId = need(actor);
  const current = await getEstimate(companyId, id);
  if (!canConvert(current.status))
    throw new ValidationError('Only an accepted estimate can become an invoice.');
  const today = new Date().toISOString().slice(0, 10);
  const terms = current.input.paymentTerms;
  const invoice = await createInvoice(actor, {
    ...current.input,
    kind: 'invoice',
    issueDate: today,
    dueDate: dueDateFor(today, terms, terms === 'custom' ? today : null),
    notes: current.input.notes,
  });
  const r = await getAdminSupabase()
    .from('estimates')
    .update({ status: 'converted', converted_invoice_id: invoice.id })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'accepted')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logEstimateEvent(companyId, id, 'converted', 'Converted to an invoice draft', actor.userId);
  await getService('audit').record({
    action: 'estimate.converted',
    resourceType: 'estimate',
    resourceId: id,
    companyId,
    metadata: { invoiceId: invoice.id, by: actor.userId },
  });
  return {
    invoice,
    totalsChanged: !Money.parse(invoice.totals.total).eq(Money.parse(current.total)),
  };
}

/** Job: estimates past their valid-until date become expired. */
export async function expireEstimates(): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_estimate_expire', {
    p_today: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new InternalError(error);
  return toInt(data, 0);
}
