// path: services/purchase/orders.ts
// Purchase orders: draft, approval (a staff member's order waits for the owner), send to the supplier by e-mail,
// receive goods into stock (in parts), cancel. Totals are worked out on the server with decimal arithmetic.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { decodeCursor, encodeCursor } from '@/lib/crm/search';
import { computeTotals } from '@/lib/procurement/totals';
import type { PoAction, PoInput, PoListQuery, PoStatus } from '@/lib/procurement/orders';
import { formatNumber } from '@/lib/stock/documents';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();
const PAGE = 25;
type Row = Record<string, unknown>;

export interface PoLineView {
  id: string;
  position: number;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string;
  description: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
  lineTotal: string;
  receivedQty: string;
}
export interface PoView {
  id: string;
  number: string;
  status: PoStatus;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  orderDate: string;
  expectedDate: string | null;
  supplierReference: string;
  notes: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  rejectedReason: string;
  sentAt: string | null;
  version: number;
  createdAt: string;
  lines: PoLineView[];
}
export interface PoRow {
  id: string;
  number: string;
  status: PoStatus;
  supplierName: string;
  orderDate: string;
  total: string;
}

const COLUMNS =
  'id, number, status, supplier_id, warehouse_id, order_date, expected_date, supplier_reference, notes, subtotal, tax_total, total, rejected_reason, sent_at, version, created_at';

function needCompany(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function lineViews(companyId: string, poId: string): Promise<PoLineView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('purchase_order_lines')
    .select(
      'id, position, product_id, variant_id, description, quantity, unit_cost, tax_rate, line_total, received_qty',
    )
    .eq('company_id', companyId)
    .eq('purchase_order_id', poId)
    .is('deleted_at', null)
    .order('position');
  if (error) throw new InternalError(error);
  const pids = [...new Set((data ?? []).map((r) => String(r.product_id)))];
  const vids = [
    ...new Set((data ?? []).flatMap((r) => (r.variant_id ? [String(r.variant_id)] : []))),
  ];
  const [p, v] = await Promise.all([
    pids.length
      ? admin.from('products').select('id, name').in('id', pids)
      : Promise.resolve({ data: [] as Row[] }),
    vids.length
      ? admin.from('product_variants').select('id, name').in('id', vids)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const vm = new Map((v.data ?? []).map((x) => [String(x.id), String(x.name)]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    position: Math.trunc(Number(r.position)),
    productId: String(r.product_id),
    productName: pm.get(String(r.product_id)) ?? '',
    variantId: r.variant_id ? String(r.variant_id) : null,
    variantName: r.variant_id ? (vm.get(String(r.variant_id)) ?? '') : '',
    description: String(r.description ?? ''),
    quantity: dec(r.quantity),
    unitCost: dec(r.unit_cost),
    taxRate: dec(r.tax_rate),
    lineTotal: dec(r.line_total),
    receivedQty: dec(r.received_qty),
  }));
}

export async function getOrder(companyId: string, id: string): Promise<PoView> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('purchase_orders')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const [s, w] = await Promise.all([
    admin.from('suppliers').select('name').eq('id', String(data.supplier_id)).maybeSingle(),
    admin.from('warehouses').select('name').eq('id', String(data.warehouse_id)).maybeSingle(),
  ]);
  return {
    id: String(data.id),
    number: String(data.number),
    status: String(data.status) as PoStatus,
    supplierId: String(data.supplier_id),
    supplierName: String(s.data?.name ?? ''),
    warehouseId: String(data.warehouse_id),
    warehouseName: String(w.data?.name ?? ''),
    orderDate: String(data.order_date),
    expectedDate: data.expected_date ? String(data.expected_date) : null,
    supplierReference: String(data.supplier_reference ?? ''),
    notes: String(data.notes ?? ''),
    subtotal: dec(data.subtotal),
    taxTotal: dec(data.tax_total),
    total: dec(data.total),
    rejectedReason: String(data.rejected_reason ?? ''),
    sentAt: data.sent_at ? String(data.sent_at) : null,
    version: Math.trunc(Number(data.version)),
    createdAt: String(data.created_at),
    lines: await lineViews(companyId, id),
  };
}

export async function listOrders(
  companyId: string,
  query: PoListQuery,
): Promise<{ rows: PoRow[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  let q = admin
    .from('purchase_orders')
    .select('id, number, status, supplier_id, order_date, total, created_at')
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
      status: String(r.status) as PoStatus,
      supplierName: sm.get(String(r.supplier_id)) ?? '',
      orderDate: String(r.order_date),
      total: dec(r.total),
    })),
    next:
      all.length > PAGE && last
        ? encodeCursor({ v: String(last.created_at), id: String(last.id) })
        : null,
  };
}

async function assertInput(companyId: string, input: PoInput): Promise<void> {
  const admin = getAdminSupabase();
  const [s, w] = await Promise.all([
    admin
      .from('suppliers')
      .select('id, status')
      .eq('id', input.supplierId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('warehouses')
      .select('id')
      .eq('id', input.warehouseId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);
  if (!s.data) throw new ValidationError('Choose one of your suppliers.');
  if (s.data.status !== 'active') throw new ValidationError('This supplier is archived.');
  if (!w.data) throw new ValidationError('Choose one of your active warehouses.');
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  const p = await admin
    .from('products')
    .select('id, kind, track_inventory')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('id', ids);
  if (p.error) throw new InternalError(p.error);
  if ((p.data ?? []).length !== ids.length) throw new ValidationError('Some items were not found.');
  if ((p.data ?? []).some((x) => x.kind !== 'product' || x.track_inventory !== true))
    throw new ValidationError('Only products with stock tracking can be ordered.');
  const vids = input.lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
  if (vids.length > 0) {
    const v = await admin
      .from('product_variants')
      .select('id, product_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('id', vids);
    for (const l of input.lines)
      if (
        l.variantId &&
        !(v.data ?? []).some(
          (x) => String(x.id) === l.variantId && String(x.product_id) === l.productId,
        )
      )
        throw new ValidationError('A variant does not belong to its item.');
  }
}

async function writeLines(
  companyId: string,
  poId: string,
  input: PoInput,
): Promise<{ subtotal: string; taxTotal: string; total: string }> {
  const admin = getAdminSupabase();
  const totals = computeTotals(input.lines);
  const gone = await admin
    .from('purchase_order_lines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('purchase_order_id', poId)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (gone.error) throw new InternalError(gone.error);
  const r = await admin.from('purchase_order_lines').insert(
    input.lines.map((l, i) => ({
      company_id: companyId,
      purchase_order_id: poId,
      position: i + 1,
      product_id: l.productId,
      variant_id: l.variantId,
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

export async function createOrder(actor: Actor, input: PoInput): Promise<PoView> {
  const companyId = needCompany(actor);
  await assertInput(companyId, input);
  const admin = getAdminSupabase();
  const year = new Date().getUTCFullYear();
  const seq = await admin.rpc('kd_next_number', { p_company: companyId, p_key: `PO:${year}` });
  if (seq.error) throw new InternalError(seq.error);
  const number = formatNumber('PO', year, Math.trunc(Number(seq.data)));
  const { data, error } = await admin
    .from('purchase_orders')
    .insert({
      company_id: companyId,
      number,
      supplier_id: input.supplierId,
      warehouse_id: input.warehouseId,
      order_date: input.orderDate,
      expected_date: input.expectedDate,
      supplier_reference: input.supplierReference,
      notes: input.notes,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  const totals = await writeLines(companyId, id, input);
  const t = await admin
    .from('purchase_orders')
    .update({ subtotal: totals.subtotal, tax_total: totals.taxTotal, total: totals.total })
    .eq('id', id)
    .eq('company_id', companyId);
  if (t.error) throw new InternalError(t.error);
  await getService('audit').record({
    action: 'purchase_order.created',
    resourceType: 'purchase_order',
    resourceId: id,
    companyId,
    metadata: { number, by: actor.userId },
  });
  return getOrder(companyId, id);
}

export async function updateOrder(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: PoInput,
): Promise<PoView> {
  const companyId = needCompany(actor);
  const current = await getOrder(companyId, id);
  if (current.status !== 'draft') throw new ValidationError('Only a draft order can be changed.');
  await assertInput(companyId, input);
  const totals = computeTotals(input.lines);
  const r = await getAdminSupabase()
    .from('purchase_orders')
    .update({
      supplier_id: input.supplierId,
      warehouse_id: input.warehouseId,
      order_date: input.orderDate,
      expected_date: input.expectedDate,
      supplier_reference: input.supplierReference,
      notes: input.notes,
      subtotal: totals.subtotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      rejected_reason: '',
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
    action: 'purchase_order.updated',
    resourceType: 'purchase_order',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getOrder(companyId, id);
}

async function setStatus(
  companyId: string,
  id: string,
  from: PoStatus[],
  patch: Row,
): Promise<void> {
  const r = await getAdminSupabase()
    .from('purchase_orders')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .in('status', from)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0)
    throw new ValidationError('This order is not in a state that allows this.');
}

async function submit(actor: Actor, id: string): Promise<void> {
  const companyId = needCompany(actor);
  const order = await getOrder(companyId, id);
  if (order.status !== 'draft') throw new ValidationError('Only a draft can be submitted.');
  if (order.lines.length === 0) throw new ValidationError('Add at least one line.');
  const now = new Date().toISOString();
  if (actor.role === 'owner') {
    await setStatus(companyId, id, ['draft'], {
      status: 'approved',
      approved_by: actor.userId,
      approved_at: now,
    });
  } else {
    await setStatus(companyId, id, ['draft'], { status: 'pending_approval' });
    const state = await getService('approval').request({
      action: 'po.approve',
      payload: { orderId: id },
      requesterId: actor.userId,
      companyId,
    });
    await getAdminSupabase()
      .from('purchase_orders')
      .update({ approval_request_id: state.requestId })
      .eq('id', id)
      .eq('company_id', companyId);
  }
  await getService('audit').record({
    action: 'purchase_order.submitted',
    resourceType: 'purchase_order',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId, direct: actor.role === 'owner' },
  });
}

async function send(actor: Actor, id: string): Promise<void> {
  const companyId = needCompany(actor);
  const order = await getOrder(companyId, id);
  if (order.status !== 'approved' && order.status !== 'sent')
    throw new ValidationError('Only an approved order can be sent.');
  const admin = getAdminSupabase();
  const [s, c] = await Promise.all([
    admin.from('suppliers').select('name, email').eq('id', order.supplierId).maybeSingle(),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ]);
  const email = s.data?.email ? String(s.data.email) : null;
  if (!email) throw new ValidationError('This supplier has no e-mail address.');
  const lines = order.lines
    .map(
      (l) =>
        `${l.quantity.replace(/0+$/, '').replace(/\.$/, '')} x ${l.productName}${l.variantName ? ` - ${l.variantName}` : ''} at ${formatMoney(Money.parse(l.unitCost))} = ${formatMoney(Money.parse(l.lineTotal))}`,
    )
    .join('\n');
  await getService('email').send({
    template: 'invoice.purchase-order',
    to: email,
    companyId,
    data: {
      supplierName: String(s.data?.name ?? ''),
      companyName: String(c.data?.name ?? ''),
      number: order.number,
      orderDate: order.orderDate,
      expectedDate: order.expectedDate ?? '',
      total: formatMoney(Money.parse(order.total)),
      shipTo: order.warehouseName,
      notes: order.notes,
      lines,
    },
    idempotencyKey: `po-${id}-${new Date().toISOString().slice(0, 13)}`,
  });
  await setStatus(companyId, id, ['approved', 'sent'], {
    status: 'sent',
    sent_at: new Date().toISOString(),
  });
  await getService('audit').record({
    action: 'purchase_order.sent',
    resourceType: 'purchase_order',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

async function cancel(actor: Actor, id: string): Promise<void> {
  const companyId = needCompany(actor);
  await setStatus(companyId, id, ['draft', 'pending_approval', 'approved', 'sent'], {
    status: 'cancelled',
  });
  await getService('audit').record({
    action: 'purchase_order.cancelled',
    resourceType: 'purchase_order',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

async function receive(
  actor: Actor,
  id: string,
  lines: Extract<PoAction, { action: 'receive' }>['lines'],
): Promise<{ documentId: string; status: string }> {
  const companyId = needCompany(actor);
  const admin = getAdminSupabase();
  const year = new Date().getUTCFullYear();
  const seq = await admin.rpc('kd_next_number', { p_company: companyId, p_key: `GRN:${year}` });
  if (seq.error) throw new InternalError(seq.error);
  const number = formatNumber('GRN', year, Math.trunc(Number(seq.data)));
  const { data, error } = await admin.rpc('kd_po_receive', {
    p_company: companyId,
    p_po: id,
    p_lines: lines.map((l) => ({
      lineId: l.lineId,
      quantity: l.quantity,
      batchNo: l.batchNo ?? '',
      expiresOn: l.expiresOn ?? '',
    })),
    p_by: actor.userId,
    p_number: number,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        'The goods cannot be received: check the order state and the quantities still open.',
      );
    throw new InternalError(error);
  }
  const result = (data ?? {}) as {
    documentId?: string;
    status?: string;
    alerts?: { productId: string; state: string }[];
  };
  for (const a of result.alerts ?? []) {
    const p = await admin.from('products').select('name').eq('id', a.productId).maybeSingle();
    await getService('notification')
      .notify({
        companyId,
        type: a.state === 'out' ? 'stock.out' : 'stock.low',
        title: `${a.state === 'out' ? 'Out of stock' : 'Low stock'}: ${String(p.data?.name ?? 'An item')}`,
        body: `After receiving ${number}.`,
        href: `/products/${a.productId}`,
      })
      .catch(() => undefined);
  }
  await getService('audit').record({
    action: 'purchase_order.received',
    resourceType: 'purchase_order',
    resourceId: id,
    companyId,
    metadata: { document: number, by: actor.userId },
  });
  return { documentId: String(result.documentId ?? ''), status: String(result.status ?? '') };
}

export async function runOrderAction(actor: Actor, id: string, action: PoAction): Promise<PoView> {
  const companyId = needCompany(actor);
  if (action.action === 'submit') await submit(actor, id);
  else if (action.action === 'send') await send(actor, id);
  else if (action.action === 'cancel') await cancel(actor, id);
  else await receive(actor, id, action.lines);
  return getOrder(companyId, id);
}

/** Job: applies the owner's decision on orders staff submitted. */
export async function syncOrderApprovals(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('purchase_orders')
    .select('id, company_id, approval_request_id')
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
    const approved = state.status === 'approved';
    const r = await admin
      .from('purchase_orders')
      .update(
        approved
          ? { status: 'approved', approved_at: new Date().toISOString() }
          : { status: 'draft', rejected_reason: `The approval ended as ${state.status}.` },
      )
      .eq('id', String(row.id))
      .eq('company_id', String(row.company_id))
      .eq('status', 'pending_approval')
      .select('id');
    if (!r.error && r.data && r.data.length > 0) changed += 1;
  }
  return changed;
}
