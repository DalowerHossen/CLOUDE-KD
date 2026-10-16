// path: services/purchase/bills.ts
// Supplier bills: draft, post with the three-way match (bill against order and goods received), void. Totals are
// worked out on the server. Posting an accounting entry belongs to the accounting STEP.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { decodeCursor, encodeCursor } from '@/lib/crm/search';
import { computeTotals } from '@/lib/procurement/totals';
import type {
  BillAction,
  BillInput,
  BillListQuery,
  BillStatus,
  MatchStatus,
} from '@/lib/procurement/bills';
import { formatNumber } from '@/lib/stock/documents';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();
const PAGE = 25;
type Row = Record<string, unknown>;

export interface BillLineView {
  id: string;
  position: number;
  poLineId: string | null;
  productId: string | null;
  productName: string;
  description: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
  lineTotal: string;
}
export interface BillView {
  id: string;
  number: string;
  status: BillStatus;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string;
  supplierInvoiceNo: string;
  billDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  paidTotal: string;
  balance: string;
  matchStatus: MatchStatus;
  matchNote: string;
  notes: string;
  version: number;
  lines: BillLineView[];
}
export interface BillRow {
  id: string;
  number: string;
  status: BillStatus;
  supplierName: string;
  supplierInvoiceNo: string;
  dueDate: string;
  total: string;
  balance: string;
}

const COLUMNS =
  'id, number, status, supplier_id, purchase_order_id, supplier_invoice_no, bill_date, due_date, subtotal, tax_total, total, paid_total, match_status, match_note, notes, version';

function needCompany(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function lineViews(companyId: string, billId: string): Promise<BillLineView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('supplier_bill_lines')
    .select(
      'id, position, po_line_id, product_id, description, quantity, unit_cost, tax_rate, line_total',
    )
    .eq('company_id', companyId)
    .eq('bill_id', billId)
    .is('deleted_at', null)
    .order('position');
  if (error) throw new InternalError(error);
  const pids = [
    ...new Set((data ?? []).flatMap((r) => (r.product_id ? [String(r.product_id)] : []))),
  ];
  const p = pids.length
    ? await admin.from('products').select('id, name').in('id', pids)
    : { data: [] as Row[] };
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), String(x.name)]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    position: Math.trunc(Number(r.position)),
    poLineId: r.po_line_id ? String(r.po_line_id) : null,
    productId: r.product_id ? String(r.product_id) : null,
    productName: r.product_id ? (pm.get(String(r.product_id)) ?? '') : '',
    description: String(r.description ?? ''),
    quantity: dec(r.quantity),
    unitCost: dec(r.unit_cost),
    taxRate: dec(r.tax_rate),
    lineTotal: dec(r.line_total),
  }));
}

export async function getBill(companyId: string, id: string): Promise<BillView> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('supplier_bills')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const [s, po] = await Promise.all([
    admin.from('suppliers').select('name').eq('id', String(data.supplier_id)).maybeSingle(),
    data.purchase_order_id
      ? admin
          .from('purchase_orders')
          .select('number')
          .eq('id', String(data.purchase_order_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const total = Money.parseRounded(String(data.total));
  const paid = Money.parseRounded(String(data.paid_total));
  return {
    id: String(data.id),
    number: String(data.number),
    status: String(data.status) as BillStatus,
    supplierId: String(data.supplier_id),
    supplierName: String(s.data?.name ?? ''),
    purchaseOrderId: data.purchase_order_id ? String(data.purchase_order_id) : null,
    purchaseOrderNumber: String(po.data?.number ?? ''),
    supplierInvoiceNo: String(data.supplier_invoice_no ?? ''),
    billDate: String(data.bill_date),
    dueDate: String(data.due_date),
    subtotal: dec(data.subtotal),
    taxTotal: dec(data.tax_total),
    total: total.toDbString(),
    paidTotal: paid.toDbString(),
    balance: data.status === 'void' ? '0.0000' : total.sub(paid).toDbString(),
    matchStatus: String(data.match_status) as MatchStatus,
    matchNote: String(data.match_note ?? ''),
    notes: String(data.notes ?? ''),
    version: Math.trunc(Number(data.version)),
    lines: await lineViews(companyId, id),
  };
}

export async function listBills(
  companyId: string,
  query: BillListQuery,
): Promise<{ rows: BillRow[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  let q = admin
    .from('supplier_bills')
    .select(
      'id, number, status, supplier_id, supplier_invoice_no, due_date, total, paid_total, created_at',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (query.status) q = q.eq('status', query.status);
  if (query.supplierId) q = q.eq('supplier_id', query.supplierId);
  if (cursor)
    q = q.or(`created_at.lt."${cursor.v}",and(created_at.eq."${cursor.v}",id.lt.${cursor.id})`);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const all = data ?? [];
  const page = all.slice(0, PAGE);
  const sids = [...new Set(page.map((r) => String(r.supplier_id)))];
  const s = sids.length
    ? await admin.from('suppliers').select('id, name').in('id', sids)
    : { data: [] as Row[] };
  const sm = new Map((s.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: String(r.id),
      number: String(r.number),
      status: String(r.status) as BillStatus,
      supplierName: sm.get(String(r.supplier_id)) ?? '',
      supplierInvoiceNo: String(r.supplier_invoice_no ?? ''),
      dueDate: String(r.due_date),
      total: dec(r.total),
      balance:
        r.status === 'void'
          ? '0.0000'
          : Money.parseRounded(String(r.total))
              .sub(Money.parseRounded(String(r.paid_total)))
              .toDbString(),
    })),
    next:
      all.length > PAGE && last
        ? encodeCursor({ v: String(last.created_at), id: String(last.id) })
        : null,
  };
}

/** Lines of a bill for what has arrived on an order and is not billed yet, at the order's cost. */
export async function billDraftFromOrder(companyId: string, poId: string): Promise<BillInput> {
  const admin = getAdminSupabase();
  const po = await admin
    .from('purchase_orders')
    .select('id, supplier_id')
    .eq('id', poId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (po.error) throw new InternalError(po.error);
  if (!po.data) throw new NotFoundError();
  const lines = await admin
    .from('purchase_order_lines')
    .select('id, product_id, quantity, unit_cost, tax_rate, received_qty')
    .eq('company_id', companyId)
    .eq('purchase_order_id', poId)
    .is('deleted_at', null)
    .order('position');
  if (lines.error) throw new InternalError(lines.error);
  const ids = (lines.data ?? []).map((l) => String(l.id));
  const billed = ids.length
    ? await admin
        .from('supplier_bill_lines')
        .select('po_line_id, quantity, bill_id')
        .eq('company_id', companyId)
        .in('po_line_id', ids)
        .is('deleted_at', null)
    : { data: [] as Row[], error: null };
  if (billed.error) throw new InternalError(billed.error);
  const bids = [...new Set((billed.data ?? []).map((b) => String(b.bill_id)))];
  const live = bids.length
    ? await admin
        .from('supplier_bills')
        .select('id, status')
        .in('id', bids)
        .in('status', ['open', 'partial', 'paid'])
        .is('deleted_at', null)
    : { data: [] as Row[] };
  const liveIds = new Set((live.data ?? []).map((b) => String(b.id)));
  const today = new Date().toISOString().slice(0, 10);
  const out: BillInput['lines'] = [];
  for (const l of lines.data ?? []) {
    let already = Money.zero();
    for (const b of billed.data ?? [])
      if (String(b.po_line_id) === String(l.id) && liveIds.has(String(b.bill_id)))
        already = already.add(Money.parseRounded(String(b.quantity)));
    const left = Money.parseRounded(String(l.received_qty)).sub(already);
    if (!left.isPositive()) continue;
    out.push({
      poLineId: String(l.id),
      productId: String(l.product_id),
      description: '',
      quantity: left.toDbString(),
      unitCost: dec(l.unit_cost),
      taxRate: dec(l.tax_rate),
    });
  }
  return {
    supplierId: String(po.data.supplier_id),
    purchaseOrderId: poId,
    supplierInvoiceNo: '',
    billDate: today,
    dueDate: today,
    notes: '',
    lines: out,
  };
}

async function assertInput(companyId: string, input: BillInput): Promise<void> {
  const admin = getAdminSupabase();
  const s = await admin
    .from('suppliers')
    .select('id')
    .eq('id', input.supplierId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!s.data) throw new ValidationError('Choose one of your suppliers.');
  if (input.purchaseOrderId) {
    const po = await admin
      .from('purchase_orders')
      .select('id, supplier_id')
      .eq('id', input.purchaseOrderId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!po.data || String(po.data.supplier_id) !== input.supplierId)
      throw new ValidationError('The order must belong to the same supplier.');
  }
  const poLineIds = input.lines.flatMap((l) => (l.poLineId ? [l.poLineId] : []));
  if (poLineIds.length > 0) {
    if (!input.purchaseOrderId)
      throw new ValidationError('Lines that point at an order need the order on the bill.');
    const r = await admin
      .from('purchase_order_lines')
      .select('id')
      .eq('company_id', companyId)
      .eq('purchase_order_id', input.purchaseOrderId)
      .in('id', poLineIds)
      .is('deleted_at', null);
    if ((r.data ?? []).length !== new Set(poLineIds).size)
      throw new ValidationError('A line does not belong to the order.');
  }
  const pids = [...new Set(input.lines.flatMap((l) => (l.productId ? [l.productId] : [])))];
  if (pids.length > 0) {
    const r = await admin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('id', pids);
    if ((r.data ?? []).length !== pids.length)
      throw new ValidationError('Some items were not found.');
  }
}

async function writeLines(
  companyId: string,
  billId: string,
  input: BillInput,
): Promise<{ subtotal: string; taxTotal: string; total: string; lineTotals: string[] }> {
  const admin = getAdminSupabase();
  const totals = computeTotals(input.lines);
  const gone = await admin
    .from('supplier_bill_lines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('bill_id', billId)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (gone.error) throw new InternalError(gone.error);
  const r = await admin.from('supplier_bill_lines').insert(
    input.lines.map((l, i) => ({
      company_id: companyId,
      bill_id: billId,
      position: i + 1,
      po_line_id: l.poLineId,
      product_id: l.productId,
      description: l.description,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      tax_rate: l.taxRate,
      line_total: totals.lineTotals[i],
    })),
  );
  if (r.error) throw new InternalError(r.error);
  return totals;
}

export async function createBill(actor: Actor, input: BillInput): Promise<BillView> {
  const companyId = needCompany(actor);
  await assertInput(companyId, input);
  const admin = getAdminSupabase();
  const year = new Date().getUTCFullYear();
  const seq = await admin.rpc('kd_next_number', { p_company: companyId, p_key: `BILL:${year}` });
  if (seq.error) throw new InternalError(seq.error);
  const number = formatNumber('BILL', year, Math.trunc(Number(seq.data)));
  const { data, error } = await admin
    .from('supplier_bills')
    .insert({
      company_id: companyId,
      number,
      supplier_id: input.supplierId,
      purchase_order_id: input.purchaseOrderId,
      supplier_invoice_no: input.supplierInvoiceNo,
      bill_date: input.billDate,
      due_date: input.dueDate,
      notes: input.notes,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  const totals = await writeLines(companyId, id, input);
  const t = await admin
    .from('supplier_bills')
    .update({ subtotal: totals.subtotal, tax_total: totals.taxTotal, total: totals.total })
    .eq('id', id);
  if (t.error) throw new InternalError(t.error);
  await getService('audit').record({
    action: 'supplier_bill.created',
    resourceType: 'supplier_bill',
    resourceId: id,
    companyId,
    metadata: { number, by: actor.userId },
  });
  return getBill(companyId, id);
}

export async function updateBill(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: BillInput,
): Promise<BillView> {
  const companyId = needCompany(actor);
  const current = await getBill(companyId, id);
  if (current.status !== 'draft') throw new ValidationError('Only a draft bill can be changed.');
  await assertInput(companyId, input);
  const totals = computeTotals(input.lines);
  const r = await getAdminSupabase()
    .from('supplier_bills')
    .update({
      supplier_id: input.supplierId,
      purchase_order_id: input.purchaseOrderId,
      supplier_invoice_no: input.supplierInvoiceNo,
      bill_date: input.billDate,
      due_date: input.dueDate,
      notes: input.notes,
      subtotal: totals.subtotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      match_status: 'unmatched',
      match_note: '',
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .eq('status', 'draft')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await writeLines(companyId, id, input);
  await getService('audit').record({
    action: 'supplier_bill.updated',
    resourceType: 'supplier_bill',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getBill(companyId, id);
}

export async function runBillAction(
  actor: Actor,
  id: string,
  action: BillAction,
): Promise<BillView> {
  const companyId = needCompany(actor);
  const admin = getAdminSupabase();
  if (action.action === 'post') {
    const { data, error } = await admin.rpc('kd_bill_post', {
      p_company: companyId,
      p_bill: id,
      p_override: action.override,
    });
    if (error) {
      if (error.code === '22023')
        throw new ValidationError('This bill cannot be posted: it must be a draft with a total.');
      throw new InternalError(error);
    }
    const result = (data ?? {}) as { posted?: boolean; note?: string };
    if (result.posted !== true)
      throw new ValidationError(
        `The bill does not match the order and the goods received. ${result.note ?? ''}`.trim(),
      );
    await getService('audit').record({
      action: 'supplier_bill.posted',
      resourceType: 'supplier_bill',
      resourceId: id,
      companyId,
      metadata: { by: actor.userId, override: action.override },
    });
  } else {
    const r = await admin
      .from('supplier_bills')
      .update({ status: 'void' })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('paid_total', 0)
      .in('status', ['draft', 'open'])
      .is('deleted_at', null)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0)
      throw new ValidationError('Only a bill with nothing paid on it can be voided.');
    await getService('audit').record({
      action: 'supplier_bill.voided',
      resourceType: 'supplier_bill',
      resourceId: id,
      companyId,
      metadata: { by: actor.userId },
    });
  }
  return getBill(companyId, id);
}
