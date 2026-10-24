// path: services/evidence/collect.ts
// Gathers everything the platform knows about the payment behind a dispute: the invoice as it was sent, the receipt, the
// consent the payer gave, the messages sent and what happened to them, where and on what device the client looked at
// the documents, the 3D Secure result, the full timeline and the audit chain entries. It reads only this company's rows.
import 'server-only';
import { REFUND_WINDOW_DAYS } from '@/config/payment-risk';
import { CLIENT_CONSENT_VERSION } from '@/config/s13-portal';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { chainKeyFor, verifyChainByKey } from '@/services/audit/audit-service';
import { getDispute } from '@/services/dispute/disputes';
import { receiptData } from '@/services/payment/receipt-data';
import { listDeliveries } from '@/services/portal/delivery-proof';
import { consentText } from '@/services/portal/consent-capture';
import type { EncryptedPayload } from '@/types/contracts';
import {
  sortTimeline,
  type EvidencePackData,
  type PackAudit,
  type PackConsent,
  type PackMessage,
  type PackTimelineEvent,
  type PackView,
} from './types';

type Row = Record<string, unknown>;
const MAX_DECRYPTED = 25;

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

async function decryptIp(companyId: string, payload: unknown): Promise<string> {
  if (!payload || typeof payload !== 'object') return '';
  try {
    const bytes = await getService('encryption').decrypt(
      'pii',
      payload as EncryptedPayload,
      companyId,
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function toMessage(
  d: Awaited<ReturnType<typeof listDeliveries>>[number],
  document: string,
  hash: string,
): PackMessage {
  return {
    at: d.sentAt,
    template: d.template,
    subject: d.subject,
    to: d.toMasked,
    document,
    status: d.status,
    openedAt: d.openedAt,
    clickedAt: d.clickedAt,
    contentHash: hash,
  };
}

export async function collectEvidence(
  companyId: string,
  disputeId: string,
): Promise<EvidencePackData> {
  const admin = getAdminSupabase();
  const dispute = await getDispute(companyId, disputeId);
  const invoiceId = dispute.invoiceId;
  const paymentId = dispute.paymentId;

  const [invoiceRows, lineRows, payRows, linkRows, snapRows, companyRows] = await Promise.all([
    admin
      .from('invoices')
      .select(
        'number, status, bill_to, walk_in_name, issue_date, due_date, total, sent_at, client_id',
      )
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle(),
    admin
      .from('invoice_items')
      .select('position, description, quantity, unit_price, line_total')
      .eq('invoice_id', invoiceId)
      .eq('company_id', companyId)
      .order('position'),
    admin
      .from('payments')
      .select(
        'payer_ip, payer_country, three_ds, processor_transaction_id, card_identity_id, created_at, captured_at',
      )
      .eq('id', paymentId)
      .eq('company_id', companyId)
      .maybeSingle(),
    admin
      .from('payment_links')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('company_id', companyId),
    admin
      .from('invoice_snapshots')
      .select('file_id, content_hash, created_at')
      .eq('invoice_id', invoiceId)
      .eq('company_id', companyId)
      .eq('reason', 'sent')
      .is('deleted_at', null)
      .maybeSingle(),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ]);
  if (invoiceRows.error || !invoiceRows.data) throw new NotFoundError();
  if (payRows.error || !payRows.data) throw new NotFoundError();
  const inv = invoiceRows.data;
  const pay = payRows.data;
  const billTo = (inv.bill_to ?? {}) as { name?: string };
  const clientName =
    (billTo.name && billTo.name !== '' ? billTo.name : str(inv.walk_in_name)) || '-';
  const linkIds = (linkRows.data ?? []).map((l) => String(l.id));
  const clientId = inv.client_id ? String(inv.client_id) : null;
  const docIds = [invoiceId, paymentId, ...linkIds, ...(clientId ? [clientId] : [])];

  const receipt = await receiptData(companyId, paymentId).catch(() => null);

  const [consentRows, eventRows, proofs, auditRows, acceptRows] = await Promise.all([
    admin
      .from('consent_records')
      .select(
        'created_at, terms_version, text_snapshot, text_hash, ip_masked, ip_enc, user_agent, device, doc_type',
      )
      .eq('company_id', companyId)
      .in('doc_id', [invoiceId, ...linkIds])
      .order('created_at'),
    admin
      .from('portal_events')
      .select('created_at, event, doc_type, ip_masked, device')
      .eq('company_id', companyId)
      .in('doc_id', docIds)
      .order('created_at')
      .limit(500),
    listDeliveries(companyId, { clientId: clientId ?? undefined, limit: 200 }),
    admin
      .from('audit_logs')
      .select('sequence, created_at, action, entry_hash, prev_hash, resource_type')
      .eq('company_id', companyId)
      .in('resource_id', [invoiceId, paymentId, disputeId])
      .order('sequence')
      .limit(300),
    admin
      .from('estimates')
      .select('number, decided_at, signer_name, status')
      .eq('company_id', companyId)
      .eq('converted_invoice_id', invoiceId)
      .maybeSingle(),
  ]);
  for (const r of [consentRows, eventRows, auditRows])
    if (r.error) throw new InternalError(r.error);

  const consentList = consentRows.data ?? [];
  const consents: PackConsent[] = [];
  for (const [i, c] of consentList.entries()) {
    consents.push({
      at: str(c.created_at),
      version: str(c.terms_version),
      text: str(c.text_snapshot),
      textHash: str(c.text_hash),
      ipMasked: str(c.ip_masked),
      ip: i < MAX_DECRYPTED ? await decryptIp(companyId, c.ip_enc) : '',
      device: str(c.device),
      userAgent: str(c.user_agent),
    });
  }

  const hashOf = await outboxHashes(
    companyId,
    proofs.map((p) => p.id),
  );
  const messages = proofs.map((p) => toMessage(p, p.docType, hashOf.get(p.id) ?? ''));
  const docLabel = (type: string): string => type;
  const views: PackView[] = (eventRows.data ?? []).map((e) => ({
    at: str(e.created_at),
    event: str(e.event),
    document: docLabel(str(e.doc_type)),
    ipMasked: str(e.ip_masked),
    device: str(e.device),
  }));

  const acceptances: string[] = [];
  if (acceptRows.data?.decided_at && acceptRows.data.status !== 'declined')
    acceptances.push(
      `Estimate ${str(acceptRows.data.number)} accepted by ${str(acceptRows.data.signer_name)} on ${str(acceptRows.data.decided_at)}`,
    );

  const audit = await auditProof(companyId, auditRows.data ?? []);
  const timeline = buildTimeline({
    invoiceSentAt: inv.sent_at ? str(inv.sent_at) : null,
    invoiceNumber: str(inv.number),
    receipt: receipt
      ? { at: receipt.paidAt, text: `Payment ${receipt.reference} received (USD ${receipt.total})` }
      : null,
    messages,
    views,
    consents,
    refunds: receipt?.refunds ?? [],
    disputeOpenedAt: dispute.openedAt,
    acceptances: acceptRows.data?.decided_at
      ? [{ at: str(acceptRows.data.decided_at), text: acceptances[0] ?? '' }]
      : [],
  });

  return {
    generatedAt: new Date().toISOString(),
    dispute: {
      id: dispute.id,
      processorId: dispute.processorId,
      processorDisputeId: dispute.processorDisputeId,
      status: dispute.status,
      reasonCode: dispute.reasonCode,
      reasonCategory: dispute.reasonCategory,
      amount: dispute.amount,
      openedAt: dispute.openedAt,
      dueAt: dispute.dueAt,
    },
    invoice: {
      number: str(inv.number),
      status: str(inv.status),
      clientName,
      issueDate: str(inv.issue_date),
      dueDate: str(inv.due_date),
      total: str(inv.total),
      sentAt: inv.sent_at ? str(inv.sent_at) : null,
      lines: (lineRows.data ?? []).map((l) => ({
        description: str(l.description),
        quantity: str(l.quantity),
        unitPrice: str(l.unit_price),
        total: str(l.line_total),
      })),
      snapshotHash: snapRows.data ? str(snapRows.data.content_hash) : null,
      snapshotFileId: snapRows.data ? str(snapRows.data.file_id) : null,
    },
    receipt: receipt
      ? {
          reference: receipt.reference,
          paidAt: receipt.paidAt,
          amount: receipt.amount,
          surcharge: receipt.surcharge,
          total: receipt.total,
          refunded: receipt.refunded,
          method: receipt.method,
          processorName: receipt.processorName,
          processorTransactionId: pay.processor_transaction_id
            ? str(pay.processor_transaction_id)
            : null,
        }
      : null,
    consent: {
      records: consents,
      termsVersion: CLIENT_CONSENT_VERSION,
      refundWindowDays: REFUND_WINDOW_DAYS,
      refundPolicyText: consentText(),
    },
    delivery: {
      invoiceMessages: messages.filter((m) => m.document === 'invoice'),
      acceptances,
    },
    communications: messages,
    identity: {
      views,
      payerIp: pay.payer_ip ? str(pay.payer_ip) : null,
      payerCountry: pay.payer_country ? str(pay.payer_country) : null,
      cardIdentity: pay.card_identity_id ? 'A card fingerprint is stored (not shown)' : null,
      threeDs: (pay.three_ds ?? {}) as Record<string, unknown>,
    },
    timeline,
    audit,
    platform: {
      name: 'KD SOLUTION IT',
      companyName: str(companyRows.data?.name),
      note: 'This pack was made by the platform from records that cannot be changed afterwards. It holds no card number.',
    },
  };
}

async function outboxHashes(companyId: string, proofIds: string[]): Promise<Map<string, string>> {
  if (proofIds.length === 0) return new Map();
  const { data, error } = await getAdminSupabase()
    .from('delivery_proofs')
    .select('id, content_hash')
    .eq('company_id', companyId)
    .in('id', proofIds);
  if (error) throw new InternalError(error);
  return new Map((data ?? []).map((r) => [String(r.id), String(r.content_hash)]));
}

async function auditProof(companyId: string, rows: Row[]): Promise<PackAudit> {
  const chain = await verifyChainByKey(chainKeyFor(companyId), {
    fromSequence: null,
    toSequence: null,
  });
  return {
    chainOk: chain.ok,
    checkedFrom: chain.checkedFrom,
    checkedTo: chain.checkedTo,
    gaps: chain.gaps,
    entries: rows.map((r) => ({
      sequence: str(r.sequence),
      at: str(r.created_at),
      action: str(r.action),
      entryHash: str(r.entry_hash),
      prevHash: str(r.prev_hash),
    })),
  };
}

export function buildTimeline(input: {
  invoiceSentAt: string | null;
  invoiceNumber: string;
  receipt: { at: string; text: string } | null;
  messages: PackMessage[];
  views: PackView[];
  consents: PackConsent[];
  refunds: { amount: string; at: string }[];
  disputeOpenedAt: string;
  acceptances: { at: string; text: string }[];
}): PackTimelineEvent[] {
  const events: PackTimelineEvent[] = [];
  if (input.invoiceSentAt)
    events.push({
      at: input.invoiceSentAt,
      source: 'invoice',
      text: `Invoice ${input.invoiceNumber} sent`,
    });
  for (const m of input.messages) {
    events.push({ at: m.at, source: 'email', text: `Message "${m.subject}" sent to ${m.to}` });
    if (m.openedAt)
      events.push({ at: m.openedAt, source: 'email', text: `Message "${m.subject}" opened` });
    if (m.clickedAt)
      events.push({
        at: m.clickedAt,
        source: 'email',
        text: `A link in "${m.subject}" was clicked`,
      });
  }
  for (const v of input.views)
    events.push({
      at: v.at,
      source: 'portal',
      text: `Client page (${v.document}): ${v.event}${v.ipMasked ? ` from ${v.ipMasked}` : ''}`,
    });
  for (const c of input.consents)
    events.push({
      at: c.at,
      source: 'consent',
      text: `Terms and refund policy accepted (version ${c.version})`,
    });
  for (const a of input.acceptances) events.push({ at: a.at, source: 'contract', text: a.text });
  if (input.receipt)
    events.push({ at: input.receipt.at, source: 'payment', text: input.receipt.text });
  for (const r of input.refunds)
    events.push({ at: r.at, source: 'refund', text: `Refund of USD ${r.amount}` });
  events.push({ at: input.disputeOpenedAt, source: 'dispute', text: 'The payment was disputed' });
  return sortTimeline(events);
}
