// path: services/portal/notices.ts
// The messages a client gets without anybody pressing send: the receipt after a payment, the thank-you when an invoice is
// paid in full, the refund note, the estimate expiry note, and (owner-started) the estimate reminder. Each message is
// sent once (the e-mail key is built from the thing it is about) and leaves a delivery proof. A client who asked for no
// contact gets only what the law of a sale needs: the receipt and the refund note.
import 'server-only';
import { estimateLink } from '@/lib/billing/links';
import { siteUrl } from '@/lib/cms/site-url';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { receiptData } from '@/services/payment/receipt-data';
import { sendClientMail } from './client-mail';
import { clientContact } from './recipients';

const DAY = 86_400_000;
export const RECEIPT_LINK_DAYS = 90;
/** Estimates are reminded when they end within this many days, and not again within the pause. */
export const ESTIMATE_REMIND_WINDOW_DAYS = 3;
export const ESTIMATE_REMIND_PAUSE_DAYS = 7;
export const ESTIMATE_EXPIRED_LOOKBACK_DAYS = 7;

const usd = (value: string): string => formatMoney(Money.parse(value)).replace('$', '');

async function company(companyId: string): Promise<string> {
  const { data } = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  return String(data?.name ?? '');
}

async function invoiceClient(
  companyId: string,
  invoiceId: string,
): Promise<{ clientId: string; number: string; total: string } | null> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('client_id, number, total')
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data?.client_id) return null;
  return {
    clientId: String(data.client_id),
    number: String(data.number ?? ''),
    total: Money.parseRounded(String(data.total)).toDbString(),
  };
}

/** Receipt with a link to the receipt page. */
export async function sendReceiptNotice(companyId: string, paymentId: string): Promise<boolean> {
  const receipt = await receiptData(companyId, paymentId).catch(() => null);
  if (!receipt) return false;
  const payment = await getAdminSupabase()
    .from('payments')
    .select('invoice_id')
    .eq('id', paymentId)
    .eq('company_id', companyId)
    .maybeSingle();
  const invoice = payment.data
    ? await invoiceClient(companyId, String(payment.data.invoice_id))
    : null;
  const contact = invoice ? await clientContact(companyId, invoice.clientId) : null;
  if (!contact?.email) return false;
  const issued = await getService('tokens').issue({
    docType: 'receipt',
    docId: paymentId,
    companyId,
    ttlDays: RECEIPT_LINK_DAYS,
    otpRequired: false,
  });
  await sendClientMail({
    companyId,
    template: 'client.receipt',
    to: contact.email,
    data: {
      clientName: contact.name,
      companyName: receipt.companyName,
      reference: receipt.reference,
      amount: usd(receipt.total),
      paidAt: receipt.paidAt.slice(0, 10),
      invoiceNumber: receipt.invoiceNumber,
      link: `${siteUrl()}/r/${encodeURIComponent(issued.token)}`,
    },
    idempotencyKey: `receipt-${paymentId}`,
    doc: { type: 'receipt', id: paymentId },
    clientId: contact.id,
    tokenId: issued.id,
  });
  return true;
}

export async function sendRefundNotice(
  companyId: string,
  paymentId: string,
  refundId: string,
  amount: string,
): Promise<boolean> {
  const receipt = await receiptData(companyId, paymentId).catch(() => null);
  const payment = await getAdminSupabase()
    .from('payments')
    .select('invoice_id')
    .eq('id', paymentId)
    .eq('company_id', companyId)
    .maybeSingle();
  const invoice = payment.data
    ? await invoiceClient(companyId, String(payment.data.invoice_id))
    : null;
  const contact = invoice ? await clientContact(companyId, invoice.clientId) : null;
  if (!receipt || !contact?.email) return false;
  await sendClientMail({
    companyId,
    template: 'client.refund',
    to: contact.email,
    data: {
      clientName: contact.name,
      companyName: receipt.companyName,
      reference: receipt.reference,
      amount: usd(amount),
      invoiceNumber: receipt.invoiceNumber,
      refundedAt: new Date().toISOString().slice(0, 10),
    },
    idempotencyKey: `refund-${refundId}`,
    doc: { type: 'receipt', id: paymentId },
    clientId: contact.id,
  });
  return true;
}

export async function sendThankYou(companyId: string, invoiceId: string): Promise<boolean> {
  const invoice = await invoiceClient(companyId, invoiceId);
  const contact = invoice ? await clientContact(companyId, invoice.clientId) : null;
  if (!invoice || !contact?.email || contact.doNotContact) return false;
  await sendClientMail({
    companyId,
    template: 'client.thank-you',
    to: contact.email,
    data: {
      clientName: contact.name,
      companyName: await company(companyId),
      invoiceNumber: invoice.number,
      amount: usd(invoice.total),
    },
    idempotencyKey: `thanks-${invoiceId}`,
    doc: { type: 'invoice', id: invoiceId },
    clientId: contact.id,
  });
  return true;
}

export interface EstimateRow {
  id: string;
  number: string;
  clientId: string;
  total: string;
  validUntil: string;
}

async function recentProof(
  companyId: string,
  estimateId: string,
  template: string,
  days: number,
): Promise<boolean> {
  const { data } = await getAdminSupabase()
    .from('delivery_proofs')
    .select('id')
    .eq('company_id', companyId)
    .eq('doc_type', 'estimate')
    .eq('doc_id', estimateId)
    .eq('template', template)
    .gte('created_at', new Date(Date.now() - days * DAY).toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

function toEstimate(r: Record<string, unknown>): EstimateRow {
  return {
    id: String(r.id),
    number: String(r.number ?? ''),
    clientId: String(r.client_id),
    total: Money.parseRounded(String(r.total)).toDbString(),
    validUntil: String(r.valid_until),
  };
}

export type EstimateMailState = 'sent' | 'skipped' | 'failed';
export interface EstimateMailResult {
  estimateId: string;
  number: string;
  state: EstimateMailState;
  reason: string;
}

/** Open estimates that end soon and have not been reminded lately (before the client flags are checked). */
export async function candidatesForReminder(
  companyId: string,
  limit = 100,
): Promise<EstimateRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + ESTIMATE_REMIND_WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const { data, error } = await getAdminSupabase()
    .from('estimates')
    .select('id, number, client_id, total, valid_until')
    .eq('company_id', companyId)
    .in('status', ['sent', 'viewed'])
    .not('client_id', 'is', null)
    .not('number', 'is', null)
    .gte('valid_until', today)
    .lte('valid_until', until)
    .is('deleted_at', null)
    .order('valid_until')
    .limit(limit);
  if (error) throw new InternalError(error);
  return (data ?? []).map(toEstimate);
}

/** Why this estimate must not be reminded now, or null when it may be. */
export async function reminderBlock(companyId: string, e: EstimateRow): Promise<string | null> {
  const contact = await clientContact(companyId, e.clientId);
  if (!contact?.email) return 'The client has no e-mail address.';
  if (contact.doNotContact) return 'The client asked for no contact.';
  if (contact.remindersOptOut) return 'The client turned reminders off.';
  if (await recentProof(companyId, e.id, 'client.estimate-reminder', ESTIMATE_REMIND_PAUSE_DAYS))
    return 'A reminder was sent recently.';
  return null;
}

export async function remindEstimate(
  companyId: string,
  e: EstimateRow,
): Promise<EstimateMailResult> {
  const base = { estimateId: e.id, number: e.number };
  const blocked = await reminderBlock(companyId, e);
  if (blocked) return { ...base, state: 'skipped', reason: blocked };
  const contact = await clientContact(companyId, e.clientId);
  if (!contact?.email)
    return { ...base, state: 'skipped', reason: 'The client has no e-mail address.' };
  try {
    const days =
      Math.max(1, Math.ceil((Date.parse(`${e.validUntil}T23:59:59Z`) - Date.now()) / DAY)) + 7;
    const issued = await getService('tokens').issue({
      docType: 'estimate',
      docId: e.id,
      companyId,
      ttlDays: days,
      otpRequired: false,
    });
    await sendClientMail({
      companyId,
      template: 'client.estimate-reminder',
      to: contact.email,
      data: {
        clientName: contact.name,
        companyName: await company(companyId),
        number: e.number,
        total: usd(e.total),
        validUntil: e.validUntil,
        message: '',
        link: estimateLink(issued.token),
      },
      idempotencyKey: `estimate-reminder-${e.id}-${Math.floor(Date.now() / (ESTIMATE_REMIND_PAUSE_DAYS * DAY))}`,
      doc: { type: 'estimate', id: e.id },
      clientId: contact.id,
      tokenId: issued.id,
    });
    return { ...base, state: 'sent', reason: '' };
  } catch {
    return { ...base, state: 'failed', reason: 'The message could not be sent.' };
  }
}

/** Daily job: estimates that ended in the last days get one "expired" note. Returns how many were sent. */
export async function sendExpiredEstimateNotes(): Promise<number> {
  const admin = getAdminSupabase();
  const since = new Date(Date.now() - ESTIMATE_EXPIRED_LOOKBACK_DAYS * DAY)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await admin
    .from('estimates')
    .select('id, company_id, number, client_id, total, valid_until')
    .eq('status', 'expired')
    .not('client_id', 'is', null)
    .not('number', 'is', null)
    .gte('valid_until', since)
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new InternalError(error);
  let sent = 0;
  for (const row of data ?? []) {
    const companyId = String(row.company_id);
    const e = toEstimate(row);
    const contact = await clientContact(companyId, e.clientId);
    if (!contact?.email || contact.doNotContact) continue;
    if (
      await recentProof(
        companyId,
        e.id,
        'client.estimate-expired',
        ESTIMATE_EXPIRED_LOOKBACK_DAYS + 1,
      )
    )
      continue;
    const profile = await getSection(companyId, 'profile');
    await sendClientMail({
      companyId,
      template: 'client.estimate-expired',
      to: contact.email,
      data: {
        clientName: contact.name,
        companyName: await company(companyId),
        number: e.number,
        validUntil: e.validUntil,
        contactEmail: profile.value.email || 'the sender',
      },
      idempotencyKey: `estimate-expired-${e.id}`,
      doc: { type: 'estimate', id: e.id },
      clientId: contact.id,
    }).then(
      () => void (sent += 1),
      () => undefined,
    );
  }
  return sent;
}
