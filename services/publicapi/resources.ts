// path: services/publicapi/resources.ts
// The resources of the public API. A live key reads the live tables of the company (read only: clients, products, invoices,
// payments, estimates; fields that are internal, such as cost prices, notes, processor ids and payer addresses, are never
// returned). A sandbox key reads and writes only its own sandbox records (`sandbox.ts`) and can create and change test clients,
// products, invoices and estimates; a live key cannot write through the API until the owning STEPs offer write operations
// (request R1). Lists use cursor pagination on the id (which is time ordered), a filter per field and a sort.
import 'server-only';
import {
  AppError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { dataSourceFor, type KeyMode } from '@/lib/integrations/api-key-rules';
import {
  decodeCursor,
  encodeCursor,
  type ClientOut,
  type EstimateOut,
  type InvoiceOut,
  type PaymentOut,
  type ProductOut,
} from '@/lib/integrations/public-schemas';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  allSandbox,
  createSandbox,
  getSandbox,
  updateSandbox,
  type SandboxDoc,
  type SandboxRecord,
  type SandboxResource,
} from './sandbox';

export type ResourceName = SandboxResource;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Ctx {
  companyId: string;
  mode: KeyMode;
}

export interface ListParams {
  limit: number;
  cursor?: string | undefined;
  sort: 'created_desc' | 'created_asc';
  updated_since?: string | undefined;
  [filter: string]: unknown;
}

type Row = Record<string, unknown>;

const money = (v: unknown): string => Money.parse(String(v ?? 0)).toDbString();
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const int = (v: unknown): number => Math.trunc(Number.parseInt(String(v ?? 0), 10));

/* ---------- live rows to answers ---------- */

export const toClient = (r: Row): ClientOut => ({
  id: str(r.id),
  kind: r.kind === 'person' ? 'person' : 'company',
  name: str(r.name),
  contact_name: str(r.contact_name),
  email: strOrNull(r.email),
  phone: str(r.phone),
  website: str(r.website),
  tax_id: str(r.tax_id),
  currency: str(r.display_currency) || 'USD',
  payment_terms_days:
    r.payment_terms_days === null || r.payment_terms_days === undefined
      ? null
      : int(r.payment_terms_days),
  tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
  status: r.status === 'archived' ? 'archived' : 'active',
  billing_address: {
    line1: str(r.billing_line1),
    line2: str(r.billing_line2),
    city: str(r.billing_city),
    region: str(r.billing_region),
    postal_code: str(r.billing_postal_code),
    country: strOrNull(r.billing_country),
  },
  created_at: str(r.created_at),
  updated_at: str(r.updated_at),
  version: int(r.version),
});

export const toProduct = (r: Row): ProductOut => ({
  id: str(r.id),
  kind: r.kind === 'service' ? 'service' : r.kind === 'bundle' ? 'bundle' : 'product',
  name: str(r.name),
  description: str(r.description),
  sku: strOrNull(r.sku),
  barcode: strOrNull(r.barcode),
  unit: str(r.unit),
  unit_price: money(r.unit_price),
  tax_category:
    (['standard', 'reduced', 'zero', 'exempt'] as const).find((c) => c === r.tax_category) ??
    'standard',
  tax_rate: str(r.tax_rate),
  status: r.status === 'inactive' ? 'inactive' : r.status === 'archived' ? 'archived' : 'active',
  created_at: str(r.created_at),
  updated_at: str(r.updated_at),
  version: int(r.version),
});

const toItem = (r: Row): NonNullable<InvoiceOut['items']>[number] => ({
  position: int(r.position),
  sku: str(r.sku),
  description: str(r.description),
  quantity: money(r.quantity),
  unit: str(r.unit),
  unit_price: money(r.unit_price),
  tax: money(r.tax),
  line_total: money(r.line_total),
});

export const toInvoice = (r: Row, items?: Row[]): InvoiceOut => ({
  id: str(r.id),
  number: strOrNull(r.number),
  kind: str(r.kind),
  status: str(r.status),
  client_id: strOrNull(r.client_id),
  issue_date: str(r.issue_date),
  due_date: str(r.due_date),
  currency: 'USD',
  subtotal: money(r.subtotal),
  tax_total: money(r.tax_total),
  total: money(r.total),
  amount_paid: money(r.amount_paid),
  amount_due: money(r.amount_due),
  sent_at: strOrNull(r.sent_at),
  paid_at: strOrNull(r.paid_at),
  ...(items ? { items: items.map(toItem) } : {}),
  created_at: str(r.created_at),
  updated_at: str(r.updated_at),
  version: int(r.version),
});

export const toEstimate = (r: Row): EstimateOut => ({
  id: str(r.id),
  number: strOrNull(r.number),
  status: str(r.status),
  client_id: strOrNull(r.client_id),
  currency: 'USD',
  subtotal: money(r.subtotal),
  tax_total: money(r.tax_total),
  total: money(r.total),
  valid_until: strOrNull(r.valid_until),
  sent_at: strOrNull(r.sent_at),
  created_at: str(r.created_at),
  updated_at: str(r.updated_at),
  version: int(r.version),
});

export const toPayment = (r: Row): PaymentOut => ({
  id: str(r.id),
  invoice_id: str(r.invoice_id),
  client_id: strOrNull(r.client_id),
  status: str(r.status),
  amount: money(r.amount),
  currency: 'USD',
  captured_amount: money(r.captured_amount),
  refunded_amount: money(r.refunded_amount),
  payment_method: str(r.payment_method),
  captured_at: strOrNull(r.captured_at),
  created_at: str(r.created_at),
  updated_at: str(r.updated_at),
  version: int(r.version),
});

/* ---------- what each resource reads ---------- */

interface Def {
  table: string;
  columns: string;
  map: (r: Row) => Record<string, unknown>;
  /** List parameter, database column and field of the answer for an equality filter. */
  equals: readonly { param: string; column: string; field: string }[];
  ranges: readonly { param: string; column: string; op: 'gte' | 'lte'; field: string }[];
}

const DEFS: Record<ResourceName, Def> = {
  clients: {
    table: 'clients',
    columns:
      'id, kind, name, contact_name, email, phone, website, tax_id, display_currency, payment_terms_days, tags, status, billing_line1, billing_line2, billing_city, billing_region, billing_postal_code, billing_country, created_at, updated_at, version',
    map: toClient,
    equals: [
      { param: 'status', column: 'status', field: 'status' },
      { param: 'email', column: 'email', field: 'email' },
    ],
    ranges: [],
  },
  products: {
    table: 'products',
    columns:
      'id, kind, name, description, sku, barcode, unit, unit_price, tax_category, tax_rate, status, created_at, updated_at, version',
    map: toProduct,
    equals: [
      { param: 'status', column: 'status', field: 'status' },
      { param: 'kind', column: 'kind', field: 'kind' },
      { param: 'sku', column: 'sku', field: 'sku' },
    ],
    ranges: [],
  },
  invoices: {
    table: 'invoices',
    columns:
      'id, number, kind, status, client_id, issue_date, due_date, subtotal, tax_total, total, amount_paid, amount_due, sent_at, paid_at, created_at, updated_at, version',
    map: (r) => toInvoice(r),
    equals: [
      { param: 'status', column: 'status', field: 'status' },
      { param: 'client_id', column: 'client_id', field: 'client_id' },
    ],
    ranges: [
      { param: 'issued_from', column: 'issue_date', op: 'gte', field: 'issue_date' },
      { param: 'issued_to', column: 'issue_date', op: 'lte', field: 'issue_date' },
    ],
  },
  estimates: {
    table: 'estimates',
    columns:
      'id, number, status, client_id, subtotal, tax_total, total, valid_until, sent_at, created_at, updated_at, version',
    map: toEstimate,
    equals: [
      { param: 'status', column: 'status', field: 'status' },
      { param: 'client_id', column: 'client_id', field: 'client_id' },
    ],
    ranges: [],
  },
  payments: {
    table: 'payments',
    columns:
      'id, invoice_id, client_id, status, amount, captured_amount, refunded_amount, payment_method, captured_at, created_at, updated_at, version',
    map: toPayment,
    equals: [
      { param: 'status', column: 'status', field: 'status' },
      { param: 'invoice_id', column: 'invoice_id', field: 'invoice_id' },
    ],
    ranges: [],
  },
};

const fromRecord = (rec: SandboxRecord): Record<string, unknown> => ({
  id: rec.id,
  ...rec.doc,
  created_at: rec.createdAt,
  updated_at: rec.updatedAt,
  version: rec.version,
});

/** The page of a sorted list: the rows after the cursor, and the cursor of the next page when more rows follow. */
export function pageOf<T extends { id: string }>(rows: readonly T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last.id) : null,
  };
}

function cursorId(params: ListParams): string | null {
  if (params.cursor === undefined) return null;
  const id = decodeCursor(params.cursor);
  if (id === null) throw new ValidationError('The cursor is not valid.');
  return id;
}

/** Filters, sorts and pages rows in memory (the sandbox set is small): the same rules as the database query of a live key. */
export function selectRows(
  name: ResourceName,
  all: readonly Record<string, unknown>[],
  params: ListParams,
): Page<Record<string, unknown>> {
  const def = DEFS[name];
  const after = cursorId(params);
  const asc = params.sort === 'created_asc';
  let rows = [...all];
  for (const f of def.equals) {
    const want = params[f.param];
    if (want !== undefined) rows = rows.filter((r) => r[f.field] === want);
  }
  for (const f of def.ranges) {
    const want = params[f.param];
    if (typeof want === 'string')
      rows = rows.filter((r) => {
        const v = str(r[f.field]);
        return f.op === 'gte' ? v >= want : v <= want;
      });
  }
  if (params.updated_since !== undefined) {
    const since = Date.parse(params.updated_since);
    rows = rows.filter((r) => Date.parse(str(r.updated_at)) >= since);
  }
  rows.sort((a, b) => (asc ? 1 : -1) * str(a.id).localeCompare(str(b.id)));
  if (after !== null) rows = rows.filter((r) => (asc ? str(r.id) > after : str(r.id) < after));
  return pageOf(rows as { id: string }[], params.limit) as Page<Record<string, unknown>>;
}

/* ---------- list and get ---------- */

export async function listResource(
  ctx: Ctx,
  name: ResourceName,
  params: ListParams,
): Promise<Page<Record<string, unknown>>> {
  const def = DEFS[name];
  const after = cursorId(params);
  const asc = params.sort === 'created_asc';
  if (dataSourceFor(ctx.mode) === 'sandbox')
    return selectRows(name, (await allSandbox(ctx.companyId, name)).map(fromRecord), params);
  let q = getAdminSupabase()
    .from(def.table)
    .select(def.columns)
    .eq('company_id', ctx.companyId)
    .is('deleted_at', null);
  for (const f of def.equals) {
    const want = params[f.param];
    if (want !== undefined) q = q.eq(f.column, want as string);
  }
  for (const f of def.ranges) {
    const want = params[f.param];
    if (typeof want === 'string')
      q = f.op === 'gte' ? q.gte(f.column, want) : q.lte(f.column, want);
  }
  if (params.updated_since !== undefined) q = q.gte('updated_at', params.updated_since);
  if (after !== null) q = asc ? q.gt('id', after) : q.lt('id', after);
  const { data, error } = await q.order('id', { ascending: asc }).limit(params.limit + 1);
  if (error) throw new InternalError(error);
  const rows = ((data ?? []) as unknown as Row[]).map(def.map) as { id: string }[];
  return pageOf(rows, params.limit) as Page<Record<string, unknown>>;
}

export async function getResource(
  ctx: Ctx,
  name: ResourceName,
  id: string,
): Promise<Record<string, unknown>> {
  const def = DEFS[name];
  if (dataSourceFor(ctx.mode) === 'sandbox')
    return fromRecord(await getSandbox(ctx.companyId, name, id));
  const { data, error } = await getAdminSupabase()
    .from(def.table)
    .select(def.columns)
    .eq('company_id', ctx.companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const row = data as unknown as Row;
  if (name !== 'invoices') return def.map(row);
  const items = await getAdminSupabase()
    .from('invoice_items')
    .select('position, sku, description, quantity, unit, unit_price, tax, line_total')
    .eq('company_id', ctx.companyId)
    .eq('invoice_id', id)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .limit(5000);
  if (items.error) throw new InternalError(items.error);
  return toInvoice(row, (items.data ?? []) as unknown as Row[]);
}

/* ---------- sandbox writes ---------- */

/** A live key cannot write through the API yet: the owning STEPs offer no write operation (request R1). */
export function requireSandbox(mode: KeyMode): void {
  if (mode !== 'sandbox')
    throw new AppError(
      'service_unavailable',
      501,
      'Writing live records through the API is not available yet. Use a sandbox key to try writes.',
      { expose: true },
    );
}

const asDoc = (value: Record<string, unknown>): SandboxDoc => value as SandboxDoc;

export async function createClientSandbox(
  ctx: Ctx,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const doc = { ...body, currency: 'USD', status: 'active' };
  return fromRecord(await createSandbox(ctx.companyId, 'clients', asDoc(doc)));
}

export async function createProductSandbox(
  ctx: Ctx,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const doc = {
    ...body,
    barcode: null,
    tax_category: 'standard',
    status: 'active',
  };
  return fromRecord(await createSandbox(ctx.companyId, 'products', asDoc(doc)));
}

/** A change with an optimistic version check (rule 15). */
export async function updateSandboxChecked(
  ctx: Ctx,
  name: 'clients' | 'products',
  id: string,
  body: Record<string, unknown> & { version: number },
): Promise<Record<string, unknown>> {
  const current = await getSandbox(ctx.companyId, name, id);
  if (current.version !== body.version)
    throw new ConflictError('The record changed. Reload it and try again.');
  const { version: _version, ...patch } = body;
  void _version;
  return fromRecord(await updateSandbox(ctx.companyId, name, id, asDoc(patch)));
}

interface Line {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

/** Totals of the lines with `Money`: each line is quantity times price, its tax is the rate of the line (rounded half up to four places). */
export function priceLines(lines: readonly Line[]): {
  items: NonNullable<InvoiceOut['items']>;
  subtotal: string;
  tax_total: string;
  total: string;
} {
  const items = lines.map((l, i) => {
    const net = Money.parse(l.unit_price).mul(l.quantity);
    const tax = net.percent(l.tax_rate);
    return {
      position: i + 1,
      sku: '',
      description: l.description,
      quantity: Money.parse(l.quantity).toDbString(),
      unit: 'unit',
      unit_price: Money.parse(l.unit_price).toDbString(),
      tax: tax.toDbString(),
      line_total: net.add(tax).toDbString(),
      _net: net,
      _tax: tax,
    };
  });
  const subtotal = Money.sum(items.map((x) => x._net));
  const tax = Money.sum(items.map((x) => x._tax));
  return {
    items: items.map(({ _net, _tax, ...rest }) => {
      void _net;
      void _tax;
      return rest;
    }),
    subtotal: subtotal.toDbString(),
    tax_total: tax.toDbString(),
    total: subtotal.add(tax).toDbString(),
  };
}

async function nextNumber(
  ctx: Ctx,
  name: 'invoices' | 'estimates',
  prefix: string,
): Promise<string> {
  const count = (await allSandbox(ctx.companyId, name)).length;
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

async function requireSandboxClient(ctx: Ctx, clientId: string): Promise<void> {
  await getSandbox(ctx.companyId, 'clients', clientId);
}

export async function createInvoiceSandbox(
  ctx: Ctx,
  body: {
    client_id: string;
    issue_date: string;
    due_date: string;
    items: readonly Line[];
  },
): Promise<Record<string, unknown>> {
  if (body.due_date < body.issue_date)
    throw new ValidationError('The due date cannot be before the issue date.');
  await requireSandboxClient(ctx, body.client_id);
  const priced = priceLines(body.items);
  const doc = {
    number: await nextNumber(ctx, 'invoices', 'SBX-'),
    kind: 'invoice',
    status: 'draft',
    client_id: body.client_id,
    issue_date: body.issue_date,
    due_date: body.due_date,
    currency: 'USD',
    subtotal: priced.subtotal,
    tax_total: priced.tax_total,
    total: priced.total,
    amount_paid: '0.0000',
    amount_due: priced.total,
    sent_at: null,
    paid_at: null,
    items: priced.items,
  };
  return fromRecord(await createSandbox(ctx.companyId, 'invoices', asDoc(doc)));
}

export async function createEstimateSandbox(
  ctx: Ctx,
  body: { client_id: string; valid_until: string; items: readonly Line[] },
): Promise<Record<string, unknown>> {
  await requireSandboxClient(ctx, body.client_id);
  const priced = priceLines(body.items);
  const doc = {
    number: await nextNumber(ctx, 'estimates', 'SBX-E-'),
    status: 'draft',
    client_id: body.client_id,
    currency: 'USD',
    subtotal: priced.subtotal,
    tax_total: priced.tax_total,
    total: priced.total,
    valid_until: body.valid_until,
    sent_at: null,
  };
  return fromRecord(await createSandbox(ctx.companyId, 'estimates', asDoc(doc)));
}
