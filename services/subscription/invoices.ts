// path: services/subscription/invoices.ts
// The invoices the platform sends to companies for their plan (subscription, upgrade, overage, seats): numbered per year
// (PI-2026-000001), with a tax line by the buyer's country, an invoice page and a receipt once paid. A company pays by
// bank transfer (the platform team records the payment). An online card payment goes through the operator company's
// invoice (request R12): `attachOperatorInvoice` and `markPaidByOperator` are the two hooks it uses.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { withTax } from '@/lib/payment/subscription-rules';
import { taxPercentFor } from '@/lib/payment/subscription-rules';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { mailOwners } from '@/services/wallet/owner-mail';
import type { Actor } from '@/types/contracts';
import { loadBilling } from './settings';

export type InvoiceKind = 'subscription' | 'upgrade' | 'overage' | 'seats';
export type InvoiceStatus = 'open' | 'paid' | 'void' | 'uncollectible';

export interface InvoiceItemView {
  position: number;
  description: string;
  quantity: number;
  unitAmount: string;
  amount: string;
}

export interface PlatformInvoiceView {
  id: string;
  companyId: string;
  subscriptionId: string | null;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  description: string;
  subtotal: string;
  taxPercent: string;
  taxAmount: string;
  total: string;
  buyerName: string;
  buyerCountry: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  items: InvoiceItemView[];
}

const COLUMNS =
  'id, company_id, subscription_id, number, kind, status, description, subtotal, tax_percent, tax_amount, total, buyer_name, buyer_country, period_start, period_end, issued_at, due_at, paid_at, payment_method, payment_reference, operator_invoice_id, version';

interface Row {
  id: string;
  company_id: string;
  subscription_id: string | null;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  description: string;
  subtotal: string | number;
  tax_percent: string | number;
  tax_amount: string | number;
  total: string | number;
  buyer_name: string;
  buyer_country: string | null;
  period_start: string | null;
  period_end: string | null;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  operator_invoice_id: string | null;
  version: number;
}

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

function view(r: Row, items: InvoiceItemView[]): PlatformInvoiceView {
  return {
    id: r.id,
    companyId: r.company_id,
    subscriptionId: r.subscription_id,
    number: r.number,
    kind: r.kind,
    status: r.status,
    description: r.description,
    subtotal: m(r.subtotal),
    taxPercent: String(r.tax_percent),
    taxAmount: m(r.tax_amount),
    total: m(r.total),
    buyerName: r.buyer_name,
    buyerCountry: r.buyer_country,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    issuedAt: r.issued_at,
    dueAt: r.due_at,
    paidAt: r.paid_at,
    paymentMethod: r.payment_method,
    paymentReference: r.payment_reference,
    items,
  };
}

async function itemsOf(invoiceIds: readonly string[]): Promise<Map<string, InvoiceItemView[]>> {
  const out = new Map<string, InvoiceItemView[]>();
  if (invoiceIds.length === 0) return out;
  const { data, error } = await getAdminSupabase()
    .from('platform_invoice_items')
    .select('invoice_id, position, description, quantity, unit_amount, amount')
    .in('invoice_id', [...invoiceIds])
    .is('deleted_at', null)
    .order('position');
  if (error) throw new InternalError(error);
  for (const r of data ?? []) {
    const list = out.get(String(r.invoice_id)) ?? [];
    list.push({
      position: toInt(r.position, 1),
      description: String(r.description),
      quantity: toInt(r.quantity, 1),
      unitAmount: m(r.unit_amount),
      amount: m(r.amount),
    });
    out.set(String(r.invoice_id), list);
  }
  return out;
}

async function hydrate(rows: Row[]): Promise<PlatformInvoiceView[]> {
  const items = await itemsOf(rows.map((r) => r.id));
  return rows.map((r) => view(r, items.get(r.id) ?? []));
}

export interface NewInvoice {
  companyId: string;
  subscriptionId: string | null;
  kind: InvoiceKind;
  description: string;
  items: { description: string; quantity: number; unitAmount: Money }[];
  periodStart: Date | null;
  periodEnd: Date | null;
  dueAt: Date;
  /** Makes a retry create the invoice once. */
  idempotencyKey: string;
  createdBy: string | null;
  /** A coupon discount: a negative line is added and the invoice remembers which redemption it came from. */
  discount?: { redemptionId: string; label: string; amount: Money } | null;
}

export async function findByKey(companyId: string, key: string): Promise<Row | null> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as Row | null) ?? null;
}

/** Makes an invoice with its lines and tax and tells the owners. A second call with the same key returns the first invoice. */
export async function createPlatformInvoice(input: NewInvoice): Promise<PlatformInvoiceView> {
  if (input.items.length === 0 || input.items.length > 49)
    throw new ValidationError('An invoice needs between 1 and 50 lines.');
  const prior = await findByKey(input.companyId, input.idempotencyKey);
  if (prior) return (await hydrate([prior]))[0] as PlatformInvoiceView;
  const admin = getAdminSupabase();
  const company = await admin
    .from('companies')
    .select('name, country_code')
    .eq('id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (company.error) throw new InternalError(company.error);
  if (!company.data) throw new NotFoundError();
  const country = company.data.country_code ? String(company.data.country_code).trim() : null;
  const billing = await loadBilling();
  const taxPercent = taxPercentFor(country, billing.taxPercentByCountry, billing.defaultTaxPercent);
  const items =
    input.discount && input.discount.amount.isPositive()
      ? [
          ...input.items,
          {
            description: input.discount.label,
            quantity: 1,
            unitAmount: input.discount.amount.negate(),
          },
        ]
      : input.items;
  const lines = items.map((i) => ({ ...i, amount: i.unitAmount.mul(String(i.quantity)) }));
  const totals = withTax(Money.sum(lines.map((l) => l.amount)), taxPercent);
  const number = await admin.rpc('kd_platform_invoice_number', {
    p_year: new Date().getUTCFullYear(),
  });
  if (number.error) throw new InternalError(number.error);
  const inserted = await admin
    .from('platform_invoices')
    .insert({
      company_id: input.companyId,
      subscription_id: input.subscriptionId,
      number: String(number.data),
      kind: input.kind,
      description: input.description.slice(0, 300),
      subtotal: totals.subtotal.toDbString(),
      tax_percent: taxPercent,
      tax_amount: totals.taxAmount.toDbString(),
      total: totals.total.toDbString(),
      buyer_name: String(company.data.name).slice(0, 200),
      buyer_country: country,
      period_start: input.periodStart?.toISOString() ?? null,
      period_end: input.periodEnd?.toISOString() ?? null,
      due_at: input.dueAt.toISOString(),
      idempotency_key: input.idempotencyKey,
      created_by: input.createdBy,
      ...(input.discount && input.discount.amount.isPositive()
        ? {
            coupon_redemption_id: input.discount.redemptionId,
            discount_amount: input.discount.amount.toDbString(),
          }
        : {}),
    })
    .select(COLUMNS)
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const first = await findByKey(input.companyId, input.idempotencyKey);
      if (first) return (await hydrate([first]))[0] as PlatformInvoiceView;
    }
    throw new InternalError(inserted.error);
  }
  const row = inserted.data as unknown as Row;
  const lineRows = lines.map((l, i) => ({
    company_id: input.companyId,
    invoice_id: row.id,
    position: i + 1,
    description: l.description.slice(0, 300),
    quantity: l.quantity,
    unit_amount: l.unitAmount.toDbString(),
    amount: l.amount.toDbString(),
  }));
  const ins = await admin.from('platform_invoice_items').insert(lineRows);
  if (ins.error) throw new InternalError(ins.error);
  await getService('audit').record({
    action: 'subscription.invoice_created',
    resourceType: 'platform_invoice',
    resourceId: row.id,
    companyId: input.companyId,
    metadata: { number: row.number, kind: input.kind, total: totals.total.toDbString() },
  });
  const done = (await hydrate([row]))[0] as PlatformInvoiceView;
  await mailOwners(
    input.companyId,
    'billing.invoice',
    {
      companyName: done.buyerName,
      number: done.number,
      total: `${done.total} USD`,
      dueDate: done.dueAt.slice(0, 10),
      description: done.description,
      link: `/subscriptions/billing/invoices/${done.id}`,
    },
    `pinv:${done.id}`,
  );
  return done;
}

export async function listInvoices(companyId: string, limit = 50): Promise<PlatformInvoiceView[]> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('issued_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  return hydrate((data ?? []) as unknown as Row[]);
}

/** One invoice. `companyId` limits it to the company's own (an owner); null is for the platform team. */
export async function getPlatformInvoice(
  id: string,
  companyId: string | null,
): Promise<PlatformInvoiceView> {
  let q = getAdminSupabase()
    .from('platform_invoices')
    .select(COLUMNS)
    .eq('id', id)
    .is('deleted_at', null);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return (await hydrate([data as unknown as Row]))[0] as PlatformInvoiceView;
}

export async function listAllInvoices(
  actor: Actor,
  filter: { status?: InvoiceStatus; limit?: number } = {},
): Promise<PlatformInvoiceView[]> {
  if (!['super_admin', 'ceo', 'admin_staff'].includes(actor.role)) throw new ForbiddenError();
  let q = getAdminSupabase()
    .from('platform_invoices')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('issued_at', { ascending: false })
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 300));
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return hydrate((data ?? []) as unknown as Row[]);
}

/**
 * Marks an open invoice paid. Returns the invoice and whether this call changed it (false when it was already paid, so
 * a repeated call or a repeated event does nothing twice).
 */
export async function setPaid(
  invoiceId: string,
  paid: { method: string; reference: string; at: Date },
): Promise<{ invoice: PlatformInvoiceView; changed: boolean }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('platform_invoices')
    .update({
      status: 'paid',
      paid_at: paid.at.toISOString(),
      payment_method: paid.method.slice(0, 40),
      payment_reference: paid.reference.slice(0, 120),
    })
    .eq('id', invoiceId)
    .eq('status', 'open')
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (data)
    return {
      invoice: (await hydrate([data as unknown as Row]))[0] as PlatformInvoiceView,
      changed: true,
    };
  return { invoice: await getPlatformInvoice(invoiceId, null), changed: false };
}

export async function setVoid(
  invoiceId: string,
  status: 'void' | 'uncollectible',
): Promise<boolean> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .update({ status })
    .eq('id', invoiceId)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  return Boolean(data);
}

/** Links the invoice to the invoice the operator company sent for online payment (request R12). */
export async function attachOperatorInvoice(
  invoiceId: string,
  operatorInvoiceId: string,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('platform_invoices')
    .update({ operator_invoice_id: operatorInvoiceId })
    .eq('id', invoiceId)
    .eq('status', 'open');
  if (error) throw new InternalError(error);
}

export async function findByOperatorInvoice(
  operatorInvoiceId: string,
): Promise<PlatformInvoiceView | null> {
  const { data, error } = await getAdminSupabase()
    .from('platform_invoices')
    .select(COLUMNS)
    .eq('operator_invoice_id', operatorInvoiceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  return (await hydrate([data as unknown as Row]))[0] as PlatformInvoiceView;
}
