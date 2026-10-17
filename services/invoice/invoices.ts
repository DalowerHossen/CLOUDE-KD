// path: services/invoice/invoices.ts
// Invoices: create, read, change (drafts only), clone, trash and restore, revision history, manual status override.
// Totals are always worked out again on the server. A sent invoice cannot be changed (the database refuses it too).
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import type { TaxRef } from '@/lib/invoice/calc';
import type { AddressBlock, InvoiceInput, InvoiceKind, InvoiceOptions } from '@/lib/invoice/input';
import { canTransition, isEditable } from '@/lib/invoice/status';
import { addDays, type PaymentTerms } from '@/lib/invoice/terms';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { sha256Hex } from '@/lib/utils/hash';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, InvoiceStatus } from '@/types/contracts';
import { logInvoiceEvent } from './events';
import { prepareInvoice, type Prepared } from './prepare';

type Row = Record<string, unknown>;
const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export interface InvoiceItemView {
  id: string;
  position: number;
  productId: string | null;
  variantId: string | null;
  sku: string;
  description: string;
  hsCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountKind: 'none' | 'percent' | 'fixed';
  discountValue: string;
  taxExempt: boolean;
  taxes: TaxRef[];
  gross: string;
  lineDiscount: string;
  documentDiscountShare: string;
  net: string;
  tax: string;
  lineTotal: string;
}

export interface InvoiceTotals {
  subtotal: string;
  lineDiscountTotal: string;
  documentDiscount: string;
  netTotal: string;
  shipping: string;
  shippingTax: string;
  taxTotal: string;
  roundingAdjustment: string;
  total: string;
  withholding: string;
  amountDue: string;
}

export interface InvoiceView {
  id: string;
  kind: InvoiceKind;
  number: string | null;
  status: InvoiceStatus;
  clientId: string | null;
  walkInName: string;
  billTo: AddressBlock;
  shipTo: AddressBlock | null;
  seller: Record<string, unknown> | null;
  issueDate: string;
  dueDate: string;
  paymentTerms: PaymentTerms;
  poNumber: string;
  notes: string;
  internalNotes: string;
  tags: string[];
  category: string;
  projectId: string | null;
  paperSize: 'a4' | 'letter';
  template: 'classic' | 'modern' | 'minimal' | 'detailed';
  options: InvoiceOptions;
  displayCurrency: string | null;
  fxRate: string | null;
  fxRateAsOf: string | null;
  taxExempt: boolean;
  reverseCharge: boolean;
  totals: InvoiceTotals;
  taxBreakdown: { code: string; name: string; rate: string; base: string; amount: string }[];
  amountPaid: string;
  balance: string;
  parentInvoiceId: string | null;
  rejectedReason: string;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lines: InvoiceItemView[];
}

export const INVOICE_COLUMNS =
  'id, kind, number, status, client_id, walk_in_name, bill_to, ship_to, seller, issue_date, due_date, payment_terms, po_number, notes, internal_notes, tags, category, project_id, paper_size, template, price_mode, discount_order, rounding_policy, rounding_mode, precision, cash_rounding, document_discount_kind, document_discount_value, shipping_amount, shipping_taxable, shipping_taxes, withholding_rate, tax_exempt, reverse_charge, subtotal, line_discount_total, document_discount, net_total, shipping, shipping_tax, tax_total, tax_breakdown, rounding_adjustment, total, withholding, amount_due, amount_paid, display_currency, fx_rate, fx_rate_as_of, parent_invoice_id, rejected_reason, sent_at, viewed_at, paid_at, voided_at, void_reason, version, created_at, updated_at, deleted_at';

const ITEM_COLUMNS =
  'id, position, product_id, variant_id, sku, description, hs_code, quantity, unit, unit_price, discount_kind, discount_value, tax_exempt, taxes, gross, line_discount, document_discount_share, net, tax, line_total';

const EMPTY_BLOCK: AddressBlock = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  taxLabel: '',
  taxId: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: null,
};

function block(v: unknown): AddressBlock {
  return { ...EMPTY_BLOCK, ...((v ?? {}) as Partial<AddressBlock>) };
}

function itemView(r: Row): InvoiceItemView {
  return {
    id: String(r.id),
    position: toInt(r.position, 1),
    productId: r.product_id ? String(r.product_id) : null,
    variantId: r.variant_id ? String(r.variant_id) : null,
    sku: String(r.sku ?? ''),
    description: String(r.description),
    hsCode: String(r.hs_code ?? ''),
    quantity: dec(r.quantity),
    unit: String(r.unit),
    unitPrice: dec(r.unit_price),
    discountKind: String(r.discount_kind) as InvoiceItemView['discountKind'],
    discountValue: dec(r.discount_value),
    taxExempt: r.tax_exempt === true,
    taxes: (r.taxes as TaxRef[] | null) ?? [],
    gross: dec(r.gross),
    lineDiscount: dec(r.line_discount),
    documentDiscountShare: dec(r.document_discount_share),
    net: dec(r.net),
    tax: dec(r.tax),
    lineTotal: dec(r.line_total),
  };
}

export function toInvoiceView(r: Row, items: Row[]): InvoiceView {
  const amountDue = Money.parseRounded(String(r.amount_due));
  const paid = Money.parseRounded(String(r.amount_paid));
  const shippingTaxes = (r.shipping_taxes as TaxRef[] | null) ?? [];
  return {
    id: String(r.id),
    kind: String(r.kind) as InvoiceKind,
    number: r.number ? String(r.number) : null,
    status: String(r.status) as InvoiceStatus,
    clientId: r.client_id ? String(r.client_id) : null,
    walkInName: String(r.walk_in_name ?? ''),
    billTo: block(r.bill_to),
    shipTo: r.ship_to ? block(r.ship_to) : null,
    seller: (r.seller as Record<string, unknown> | null) ?? null,
    issueDate: String(r.issue_date),
    dueDate: String(r.due_date),
    paymentTerms: String(r.payment_terms) as PaymentTerms,
    poNumber: String(r.po_number ?? ''),
    notes: String(r.notes ?? ''),
    internalNotes: String(r.internal_notes ?? ''),
    tags: (r.tags as string[] | null) ?? [],
    category: String(r.category ?? ''),
    projectId: r.project_id ? String(r.project_id) : null,
    paperSize: String(r.paper_size) as InvoiceView['paperSize'],
    template: String(r.template) as InvoiceView['template'],
    options: {
      priceMode: String(r.price_mode) as InvoiceOptions['priceMode'],
      discountOrder: String(r.discount_order) as InvoiceOptions['discountOrder'],
      roundingPolicy: String(r.rounding_policy) as InvoiceOptions['roundingPolicy'],
      roundingMode: String(r.rounding_mode) as InvoiceOptions['roundingMode'],
      precision: toInt(r.precision, 2) as InvoiceOptions['precision'],
      cashRounding: String(r.cash_rounding) as InvoiceOptions['cashRounding'],
      documentDiscountKind: String(
        r.document_discount_kind,
      ) as InvoiceOptions['documentDiscountKind'],
      documentDiscountValue: dec(r.document_discount_value),
      shippingAmount: dec(r.shipping_amount),
      shippingTaxable: r.shipping_taxable === true,
      shippingTaxCodes: shippingTaxes.map((t) => t.code),
      withholdingRate: dec(r.withholding_rate),
    },
    displayCurrency: r.display_currency ? String(r.display_currency) : null,
    fxRate: r.fx_rate ? String(r.fx_rate) : null,
    fxRateAsOf: r.fx_rate_as_of ? String(r.fx_rate_as_of) : null,
    taxExempt: r.tax_exempt === true,
    reverseCharge: r.reverse_charge === true,
    totals: {
      subtotal: dec(r.subtotal),
      lineDiscountTotal: dec(r.line_discount_total),
      documentDiscount: dec(r.document_discount),
      netTotal: dec(r.net_total),
      shipping: dec(r.shipping),
      shippingTax: dec(r.shipping_tax),
      taxTotal: dec(r.tax_total),
      roundingAdjustment: dec(r.rounding_adjustment),
      total: dec(r.total),
      withholding: dec(r.withholding),
      amountDue: amountDue.toDbString(),
    },
    taxBreakdown: (r.tax_breakdown as InvoiceView['taxBreakdown'] | null) ?? [],
    amountPaid: paid.toDbString(),
    balance: r.status === 'void' ? '0.0000' : amountDue.sub(paid).toDbString(),
    parentInvoiceId: r.parent_invoice_id ? String(r.parent_invoice_id) : null,
    rejectedReason: String(r.rejected_reason ?? ''),
    sentAt: r.sent_at ? String(r.sent_at) : null,
    viewedAt: r.viewed_at ? String(r.viewed_at) : null,
    paidAt: r.paid_at ? String(r.paid_at) : null,
    voidedAt: r.voided_at ? String(r.voided_at) : null,
    voidReason: String(r.void_reason ?? ''),
    version: toInt(r.version, 1),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at ? String(r.deleted_at) : null,
    lines: items.map(itemView),
  };
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function getInvoice(
  companyId: string,
  id: string,
  options: { includeTrashed?: boolean } = {},
): Promise<InvoiceView> {
  const admin = getAdminSupabase();
  let q = admin.from('invoices').select(INVOICE_COLUMNS).eq('id', id).eq('company_id', companyId);
  if (!options.includeTrashed) q = q.is('deleted_at', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const items = await admin
    .from('invoice_items')
    .select(ITEM_COLUMNS)
    .eq('company_id', companyId)
    .eq('invoice_id', id)
    .is('deleted_at', null)
    .order('position')
    .limit(5000);
  if (items.error) throw new InternalError(items.error);
  return toInvoiceView(data as unknown as Row, (items.data ?? []) as unknown as Row[]);
}

async function duplicateHash(input: InvoiceInput, total: string): Promise<string> {
  const who = input.clientId ?? `walk-in:${input.walkInName.trim().toLowerCase()}`;
  return sha256Hex(`${input.kind}|${who}|${total}|${input.issueDate}`);
}

function headerColumns(input: InvoiceInput, p: Prepared, hash: string): Record<string, unknown> {
  const r = p.result;
  return {
    kind: input.kind,
    client_id: input.clientId,
    walk_in_name: input.walkInName,
    bill_to: input.billTo,
    ship_to: input.shipTo,
    issue_date: input.issueDate,
    due_date: input.dueDate,
    payment_terms: input.paymentTerms,
    po_number: input.poNumber,
    notes: input.notes,
    internal_notes: input.internalNotes,
    tags: input.tags,
    category: input.category,
    project_id: input.projectId,
    paper_size: input.paperSize,
    template: input.template,
    price_mode: p.options.priceMode,
    discount_order: p.options.discountOrder,
    rounding_policy: p.options.roundingPolicy,
    rounding_mode: p.options.roundingMode,
    precision: p.options.precision,
    cash_rounding: p.options.cashRounding,
    document_discount_kind: p.options.documentDiscountKind,
    document_discount_value: p.options.documentDiscountValue,
    shipping_amount: p.options.shippingAmount,
    shipping_taxable: input.options.shippingTaxable,
    shipping_taxes: p.shippingTaxes,
    withholding_rate: p.options.withholdingRate,
    tax_exempt: p.taxExempt,
    reverse_charge: p.reverseCharge,
    subtotal: r.subtotal,
    line_discount_total: r.lineDiscountTotal,
    document_discount: r.documentDiscount,
    net_total: r.netTotal,
    shipping: r.shipping,
    shipping_tax: r.shippingTax,
    tax_total: r.taxTotal,
    tax_breakdown: r.taxBreakdown,
    rounding_adjustment: r.roundingAdjustment,
    total: r.total,
    withholding: r.withholding,
    amount_due: r.amountDue,
    display_currency: input.displayCurrency,
    fx_rate: p.fx?.rate ?? null,
    fx_rate_as_of: p.fx?.asOf ?? null,
    duplicate_hash: hash,
  };
}

async function writeItems(
  companyId: string,
  invoiceId: string,
  input: InvoiceInput,
  p: Prepared,
): Promise<void> {
  const admin = getAdminSupabase();
  const gone = await admin
    .from('invoice_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null);
  if (gone.error) throw new InternalError(gone.error);
  if (input.lines.length === 0) return;
  const rows = input.lines.map((l, i) => {
    const calc = p.result.lines[i];
    return {
      company_id: companyId,
      invoice_id: invoiceId,
      position: i + 1,
      product_id: l.productId,
      variant_id: l.variantId,
      sku: l.sku,
      description: l.description,
      hs_code: l.hsCode,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unitPrice,
      discount_kind: l.discountKind,
      discount_value: l.discountValue,
      tax_exempt: l.taxExempt || p.taxExempt || p.reverseCharge,
      taxes: p.calcLines[i]?.taxes ?? [],
      gross: calc?.gross ?? '0',
      line_discount: calc?.lineDiscount ?? '0',
      document_discount_share: calc?.documentDiscountShare ?? '0',
      net: calc?.net ?? '0',
      tax: calc?.tax ?? '0',
      line_total: calc?.total ?? '0',
    };
  });
  // Large invoices go in several inserts so a single request stays small.
  for (let i = 0; i < rows.length; i += 500) {
    // tenant-ok: every row carries company_id
    const r = await admin.from('invoice_items').insert(rows.slice(i, i + 500));
    if (r.error) throw new InternalError(r.error);
  }
}

/** The input as it is stored in a revision: everything needed to re-create the draft. */
export function inputOf(v: InvoiceView): InvoiceInput {
  return {
    kind: v.kind,
    clientId: v.clientId,
    walkInName: v.walkInName,
    billTo: v.billTo,
    shipTo: v.shipTo,
    issueDate: v.issueDate,
    paymentTerms: v.paymentTerms,
    dueDate: v.dueDate,
    poNumber: v.poNumber,
    notes: v.notes,
    internalNotes: v.internalNotes,
    tags: v.tags,
    category: v.category,
    projectId: v.projectId,
    paperSize: v.paperSize,
    template: v.template,
    displayCurrency: v.displayCurrency as InvoiceInput['displayCurrency'],
    options: v.options,
    lines: v.lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      sku: l.sku,
      description: l.description,
      hsCode: l.hsCode,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountKind: l.discountKind,
      discountValue: l.discountValue,
      taxExempt: l.taxExempt,
      taxCodes: l.taxes.map((t) => t.code),
    })),
  };
}

async function addRevision(
  companyId: string,
  view: InvoiceView,
  reason: string,
  actorId: string,
): Promise<void> {
  const admin = getAdminSupabase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await admin
      .from('invoice_revisions')
      .select('revision')
      .eq('company_id', companyId)
      .eq('invoice_id', view.id)
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = toInt(last.data?.revision, 0) + 1;
    const r = await admin.from('invoice_revisions').insert({
      company_id: companyId,
      invoice_id: view.id,
      revision: next,
      reason,
      snapshot: { input: inputOf(view), totals: view.totals, status: view.status },
      changed_by: actorId,
    });
    if (!r.error) return;
    if (r.error.code !== '23505') throw new InternalError(r.error);
  }
  throw new ConflictError();
}

/** A client must be one of the company's own (the clients contract answers "not found" for a foreign id). */
async function checkClient(input: InvoiceInput): Promise<void> {
  if (input.clientId) await getService('clients').getById(input.clientId);
}

export async function createInvoice(actor: Actor, input: InvoiceInput): Promise<InvoiceView> {
  const companyId = need(actor);
  await checkClient(input);
  const prepared = await prepareInvoice(companyId, input);
  const hash = await duplicateHash(input, prepared.result.total);
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .insert({
      company_id: companyId,
      created_by: actor.userId,
      ...headerColumns(input, prepared, hash),
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  await writeItems(companyId, id, input, prepared);
  const view = await getInvoice(companyId, id);
  await addRevision(companyId, view, 'Created', actor.userId);
  await logInvoiceEvent(companyId, id, 'created', 'Draft created', actor.userId);
  await getService('audit').record({
    action: 'invoice.created',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { kind: input.kind, by: actor.userId },
  });
  return view;
}

export async function updateInvoice(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: InvoiceInput,
  autosave: boolean,
): Promise<InvoiceView> {
  const companyId = need(actor);
  const current = await getInvoice(companyId, id);
  if (!isEditable(current.status))
    throw new ValidationError(
      'Only a draft can be changed. Correct a sent invoice with a credit note.',
    );
  await checkClient(input);
  const prepared = await prepareInvoice(companyId, input);
  const hash = await duplicateHash(input, prepared.result.total);
  const r = await getAdminSupabase()
    .from('invoices')
    .update(headerColumns(input, prepared, hash))
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await writeItems(companyId, id, input, prepared);
  const view = await getInvoice(companyId, id);
  if (!autosave) {
    await addRevision(companyId, view, 'Saved', actor.userId);
    await logInvoiceEvent(companyId, id, 'updated', 'Draft saved', actor.userId);
    await getService('audit').record({
      action: 'invoice.updated',
      resourceType: 'invoice',
      resourceId: id,
      companyId,
      metadata: { by: actor.userId },
    });
  }
  return view;
}

export async function trashInvoice(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const current = await getInvoice(companyId, id);
  if (current.status !== 'draft' && current.status !== 'void')
    throw new ValidationError('An invoice that was sent cannot be deleted. Void it instead.');
  if (!Money.parse(current.amountPaid).isZero())
    throw new ValidationError('An invoice with payments cannot be deleted.');
  const r = await getAdminSupabase()
    .from('invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await logInvoiceEvent(companyId, id, 'trashed', 'Moved to the trash', actor.userId);
  await getService('audit').record({
    action: 'invoice.trashed',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export async function restoreInvoice(actor: Actor, id: string): Promise<InvoiceView> {
  const companyId = need(actor);
  const trashed = await getInvoice(companyId, id, { includeTrashed: true });
  if (!trashed.deletedAt) throw new ValidationError('This invoice is not in the trash.');
  const r = await getAdminSupabase()
    .from('invoices')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .not('deleted_at', 'is', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await logInvoiceEvent(companyId, id, 'restored', 'Restored from the trash', actor.userId);
  await getService('audit').record({
    action: 'invoice.restored',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getInvoice(companyId, id);
}

/** A new draft with the same client, lines and options; dates start today and the due date follows the terms. */
export async function cloneInvoice(actor: Actor, id: string): Promise<InvoiceView> {
  const companyId = need(actor);
  const source = await getInvoice(companyId, id);
  const input = inputOf(source);
  const today = new Date().toISOString().slice(0, 10);
  const span =
    (Date.parse(`${source.dueDate}T00:00:00Z`) - Date.parse(`${source.issueDate}T00:00:00Z`)) /
    86_400_000;
  const copy = await createInvoice(actor, {
    ...input,
    issueDate: today,
    dueDate: addDays(today, span),
    internalNotes: input.internalNotes,
  });
  await logInvoiceEvent(
    companyId,
    copy.id,
    'cloned',
    `Copied from ${source.number ?? 'a draft'}`,
    actor.userId,
    {
      source: source.id,
    },
  );
  return copy;
}

export interface RevisionRow {
  revision: number;
  reason: string;
  changedBy: string | null;
  createdAt: string;
}

export async function listRevisions(companyId: string, invoiceId: string): Promise<RevisionRow[]> {
  await getInvoice(companyId, invoiceId, { includeTrashed: true });
  const { data, error } = await getAdminSupabase()
    .from('invoice_revisions')
    .select('revision, reason, changed_by, created_at')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .order('revision', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    revision: toInt(r.revision, 1),
    reason: String(r.reason),
    changedBy: r.changed_by ? String(r.changed_by) : null,
    createdAt: String(r.created_at),
  }));
}

export async function getRevision(
  companyId: string,
  invoiceId: string,
  revision: number,
): Promise<{ revision: number; input: InvoiceInput; totals: InvoiceTotals }> {
  await getInvoice(companyId, invoiceId, { includeTrashed: true });
  const { data, error } = await getAdminSupabase()
    .from('invoice_revisions')
    .select('revision, snapshot')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .eq('revision', revision)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const snap = data.snapshot as { input: InvoiceInput; totals: InvoiceTotals };
  return { revision, input: snap.input, totals: snap.totals };
}

/** Puts an earlier revision back into the draft (as a new save, so the history keeps growing). */
export async function restoreRevision(
  actor: Actor,
  id: string,
  expectedVersion: number,
  revision: number,
): Promise<InvoiceView> {
  const companyId = need(actor);
  const old = await getRevision(companyId, id, revision);
  const view = await updateInvoice(actor, id, expectedVersion, old.input, true);
  await addRevision(companyId, view, `Restored revision ${revision}`, actor.userId);
  await logInvoiceEvent(
    companyId,
    id,
    'revision_restored',
    `Revision ${revision} restored`,
    actor.userId,
  );
  await getService('audit').record({
    action: 'invoice.revision_restored',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { revision, by: actor.userId },
  });
  return view;
}

/** Owner-only: sets any status the machine allows, with a reason; every use is audited. */
export async function overrideStatus(
  actor: Actor,
  id: string,
  status: InvoiceStatus,
  reason: string,
): Promise<InvoiceView> {
  const companyId = need(actor);
  if (actor.role !== 'owner') throw new ForbiddenError();
  const current = await getInvoice(companyId, id);
  if (!canTransition(current.status, status))
    throw new ValidationError(`An invoice that is ${current.status} cannot become ${status}.`);
  if (current.status === 'draft' || status === 'draft')
    throw new ValidationError('Use the normal send and approval steps for drafts.');
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'void') {
    patch.voided_at = now;
    patch.void_reason = reason;
  }
  if (status === 'paid') patch.paid_at = now;
  const r = await getAdminSupabase()
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await logInvoiceEvent(
    companyId,
    id,
    'status_changed',
    `Status set to ${status}: ${reason}`,
    actor.userId,
    {
      from: current.status,
      to: status,
      manual: true,
    },
  );
  await getService('audit').record({
    action: 'invoice.status_override',
    resourceType: 'invoice',
    resourceId: id,
    companyId,
    metadata: { from: current.status, to: status, reason, by: actor.userId },
  });
  return getInvoice(companyId, id);
}
