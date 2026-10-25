// path: services/payment/links.ts
// Payment links and the hosted checkout (STEP 10.11). A link is a tokenized address for one invoice (the `tokens`
// contract issues it, only its hash is stored). The payer needs no login. Amounts, processor and status come from the
// server: the invoice, the routing rules and the processor answer.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getPublicEnv } from '@/lib/env/public';
import {
  PAYMENT_LINK_MAX_VALID_HOURS,
  PAYMENT_LINK_VALID_HOURS,
  REFUND_WINDOW_DAYS,
} from '@/config/payment-risk';
import { hasSecureForm } from '@/config/processors';
import { loadAdapter } from '@/lib/payment/registry';
import { defaultMode } from '@/lib/payment/modes';
import { threeDSPolicyFor } from '@/lib/payment/verification';
import { surchargeFor } from '@/lib/payment/state-machine';
import { sha256Hex } from '@/lib/utils/hash';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, InvoiceForPayment } from '@/types/contracts';
import { getProcessorRow, loadCurrentCredentials } from './credential-store';
import { getRow, toSummary } from './payment-store';
import { resumePayment, startPayment, type PaymentResult } from './payments';
import { resolveRoute } from './routing';
import { originsOfCompany } from './embed-origins';

const LINK_COLUMNS =
  'id, company_id, invoice_id, token_id, status, amount, expires_at, use_count, max_uses, created_by, created_at, version';
const PAYABLE = ['sent', 'viewed', 'partially_paid', 'overdue'];

export interface LinkRow {
  id: string;
  company_id: string;
  invoice_id: string;
  token_id: string | null;
  status: 'active' | 'paid' | 'expired' | 'revoked';
  amount: string | null;
  expires_at: string;
  use_count: number;
  max_uses: number;
  created_by: string | null;
  created_at: string;
  version: number;
}

export interface LinkView {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  amount: string | null;
  expiresAt: string;
  useCount: number;
  maxUses: number;
  createdAt: string;
}

function hoursFrom(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}

export async function createPaymentLink(
  actor: Actor,
  input: { invoiceId: string; amount: Money | null; validHours: number | null },
): Promise<{ id: string; url: string; expiresAt: string }> {
  if (!actor.companyId) throw new ForbiddenError();
  const invoice = await getService('invoices').getForPayment(input.invoiceId);
  if (invoice.companyId !== actor.companyId) throw new NotFoundError();
  if (!PAYABLE.includes(invoice.status) || !invoice.amountDue.gt('0')) {
    throw new ValidationError('A payment link needs an invoice that was sent and has a balance.');
  }
  if (input.amount && (!input.amount.gt('0') || input.amount.gt(invoice.amountDue))) {
    throw new ValidationError('The link amount must be above zero and not more than the balance.');
  }
  const hours = Math.min(
    input.validHours ?? PAYMENT_LINK_VALID_HOURS,
    PAYMENT_LINK_MAX_VALID_HOURS,
  );
  const expiresAt = hoursFrom(new Date(), hours);
  const id = randomUUID();
  const issued = await getService('tokens').issue({
    docType: 'payment',
    docId: id,
    companyId: actor.companyId,
    ttlDays: Math.max(1, (hours + 23 - ((hours + 23) % 24)) / 24),
  });
  const { error } = await getAdminSupabase()
    .from('payment_links')
    .insert({
      id,
      company_id: actor.companyId,
      invoice_id: invoice.invoiceId,
      token_id: issued.id,
      token_hash: await sha256Hex(issued.token),
      amount: input.amount ? input.amount.toDbString() : null,
      expires_at: expiresAt.toISOString(),
      created_by: actor.userId,
    });
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'payment.link.created',
    resourceType: 'payment_link',
    resourceId: id,
    metadata: {
      invoiceId: invoice.invoiceId,
      amount: input.amount?.toDbString() ?? null,
      expiresAt: expiresAt.toISOString(),
    },
  });
  const base = new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
  return { id, url: `${base}/pay/${issued.token}`, expiresAt: expiresAt.toISOString() };
}

export async function listPaymentLinks(
  companyId: string,
  invoiceId: string | null,
): Promise<LinkView[]> {
  let query = getAdminSupabase()
    .from('payment_links')
    .select(LINK_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (invoiceId) query = query.eq('invoice_id', invoiceId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as LinkRow[];
  const ids = [...new Set(rows.map((r) => r.invoice_id))];
  const numbers = new Map<string, string>();
  if (ids.length > 0) {
    const inv = await getAdminSupabase()
      .from('invoices')
      .select('id, number')
      .eq('company_id', companyId)
      .in('id', ids);
    if (inv.error) throw new InternalError(inv.error);
    for (const i of inv.data ?? []) numbers.set(String(i.id), String(i.number ?? ''));
  }
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    invoiceNumber: numbers.get(r.invoice_id) ?? '',
    status: r.status === 'active' && new Date(r.expires_at).getTime() <= now ? 'expired' : r.status,
    amount: r.amount ? Money.parseRounded(r.amount).toDbString() : null,
    expiresAt: r.expires_at,
    useCount: r.use_count,
    maxUses: r.max_uses,
    createdAt: r.created_at,
  }));
}

export async function revokePaymentLink(actor: Actor, id: string): Promise<void> {
  if (!actor.companyId) throw new ForbiddenError();
  const { data, error } = await getAdminSupabase()
    .from('payment_links')
    .update({ status: 'revoked' })
    .eq('company_id', actor.companyId)
    .eq('id', id)
    .eq('status', 'active')
    .select('id, token_id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if (data.token_id) await getService('tokens').revoke(String(data.token_id));
  await getService('audit').record({
    action: 'payment.link.revoked',
    resourceType: 'payment_link',
    resourceId: id,
  });
}

/** The public side: finds the link behind a token. Every refusal looks the same (404). */
export async function resolveLink(token: string): Promise<LinkRow> {
  const verified = await getService('tokens').verify(token);
  if (!verified.valid || verified.docType !== 'payment') throw new NotFoundError();
  const { data, error } = await getAdminSupabase()
    .from('payment_links')
    .select(LINK_COLUMNS)
    .eq('company_id', verified.companyId)
    .eq('id', verified.docId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const row = data as LinkRow | null;
  if (
    !row ||
    row.status !== 'active' ||
    new Date(row.expires_at).getTime() <= Date.now() ||
    row.use_count >= row.max_uses
  ) {
    throw new NotFoundError();
  }
  return row;
}

export interface CheckoutView {
  companyName: string;
  invoiceNumber: string;
  amount: string;
  surcharge: string;
  total: string;
  currency: 'USD';
  processorId: string;
  mode: string;
  environment: 'sandbox' | 'live';
  clientConfig: Record<string, string>;
  sessionExpiresAt: string | null;
  linkExpiresAt: string;
  refundWindowDays: number;
}

export async function payableInvoice(
  link: LinkRow,
): Promise<{ invoice: InvoiceForPayment; amount: Money }> {
  const invoice = await getService('invoices').getForPayment(link.invoice_id);
  if (
    invoice.companyId !== link.company_id ||
    !PAYABLE.includes(invoice.status) ||
    !invoice.amountDue.gt('0')
  ) {
    throw new NotFoundError();
  }
  const fixed = link.amount ? Money.parseRounded(link.amount) : null;
  const amount = fixed && fixed.lt(invoice.amountDue) ? fixed : invoice.amountDue;
  return { invoice, amount };
}

/** What the hosted checkout needs to draw the page and start the processor's secure form. */
export async function checkoutFor(token: string): Promise<CheckoutView> {
  const link = await resolveLink(token);
  const { invoice, amount } = await payableInvoice(link);
  const { data: company } = await getAdminSupabase()
    .from('companies')
    .select('name, plan_key')
    .eq('id', link.company_id)
    .maybeSingle();
  const decision = await resolveRoute({
    amount,
    country: invoice.billingCountry,
    method: 'card',
    plan: company ? String(company.plan_key) : 'free',
  });
  if (!decision)
    throw new ConflictError('Online payment is not available for this invoice right now.');
  const processor = await getProcessorRow(decision.processorId);
  if (!processor.enabled || !hasSecureForm(decision.processorId))
    throw new ConflictError('Online payment is not available for this invoice right now.');
  const adapter = await loadAdapter(decision.processorId);
  const { values } = await loadCurrentCredentials(decision.processorId);
  const surcharge = surchargeFor(amount);
  const session = await adapter.createCheckoutSession(
    {
      credentials: values,
      environment: processor.environment,
      mode: processor.active_mode || defaultMode(adapter).id,
      correlationId: getContext()?.correlationId ?? link.id,
    },
    {
      idempotencyKey: `${link.id}:session:${randomUUID()}`,
      amount: amount.add(surcharge),
      invoiceId: invoice.invoiceId,
      companyId: invoice.companyId,
      returnUrl: `${new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin}/pay/${token}`,
      threeDS: threeDSPolicyFor(adapter),
    },
  );
  return {
    companyName: company ? String(company.name) : '',
    invoiceNumber: invoice.invoiceNumber,
    amount: amount.toDbString(),
    surcharge: surcharge.toDbString(),
    total: amount.add(surcharge).toDbString(),
    currency: 'USD',
    processorId: decision.processorId,
    mode: processor.active_mode,
    environment: processor.environment,
    clientConfig: session.clientConfig,
    sessionExpiresAt: session.expiresAt,
    linkExpiresAt: link.expires_at,
    refundWindowDays: REFUND_WINDOW_DAYS,
  };
}

async function noteUse(link: LinkRow, result: PaymentResult): Promise<void> {
  if (result.status !== 'captured') return;
  const used = link.use_count + 1;
  const { error } = await getAdminSupabase()
    .from('payment_links')
    .update({ use_count: used, status: used >= link.max_uses ? 'paid' : 'active' })
    .eq('company_id', link.company_id)
    .eq('id', link.id)
    .eq('version', link.version);
  if (error) throw new InternalError(error);
}

export async function payViaLink(
  token: string,
  input: {
    paymentToken: string;
    billingPostalCode: string | null;
    returnUrl: string;
    idempotencyKey: string;
    payerIp: string;
    /** Set when the payment starts in a checkout frame on a merchant's web site (the embedded checkout). */
    embedOrigin?: string | null;
  },
): Promise<PaymentResult> {
  const link = await resolveLink(token);
  if (input.embedOrigin && !(await originsOfCompany(link.company_id)).includes(input.embedOrigin))
    throw new ForbiddenError();
  const { invoice, amount } = await payableInvoice(link);
  const result = await startPayment(
    {
      invoiceId: invoice.invoiceId,
      idempotencyKey: input.idempotencyKey,
      paymentToken: input.paymentToken,
      billingPostalCode: input.billingPostalCode,
      payerIp: input.payerIp,
      returnUrl: input.returnUrl,
    },
    { amount, linkId: link.id },
  );
  await noteUse(link, result);
  if (input.embedOrigin)
    await getService('audit').record({
      action: 'payment.embed.started',
      resourceType: 'payment',
      resourceId: result.id,
      companyId: link.company_id,
      metadata: { linkId: link.id, embedOrigin: input.embedOrigin, status: result.status },
    });
  return result;
}

export async function resumeViaLink(token: string, paymentId: string): Promise<PaymentResult> {
  const link = await resolveLink(token);
  const row = await getRow(link.company_id, paymentId);
  if (row.link_id !== link.id) throw new NotFoundError();
  const result = await resumePayment(link.company_id, paymentId);
  await noteUse(link, result);
  return result;
}

export async function linkPaymentStatus(
  token: string,
  paymentId: string,
): Promise<ReturnType<typeof toSummary>> {
  const verified = await getService('tokens').verify(token);
  if (!verified.valid || verified.docType !== 'payment') throw new NotFoundError();
  const row = await getRow(verified.companyId, paymentId);
  if (row.link_id !== verified.docId) throw new NotFoundError();
  return toSummary(row);
}
