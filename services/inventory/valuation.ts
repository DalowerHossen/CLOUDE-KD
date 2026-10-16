// path: services/inventory/valuation.ts
// Stock value, cost of goods sold and expiring batches. Value follows the method of each product: average cost uses
// the moving average of the warehouse, first and last in first out add up the open cost layers. Money is added with
// decimal arithmetic.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export interface ValuationRow {
  productId: string;
  productName: string;
  variantName: string;
  warehouseName: string;
  quantity: string;
  value: string;
  method: 'average' | 'fifo' | 'lifo';
}

export async function valuationReport(
  companyId: string,
): Promise<{ rows: ValuationRow[]; total: string }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_stock_valuation', { p_company: companyId });
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  const pids = [...new Set(rows.map((r) => String(r.product_id)))];
  const vids = [...new Set(rows.flatMap((r) => (r.variant_id ? [String(r.variant_id)] : [])))];
  const wids = [...new Set(rows.map((r) => String(r.warehouse_id)))];
  const [p, v, w] = await Promise.all([
    pids.length
      ? admin.from('products').select('id, name').in('id', pids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    vids.length
      ? admin.from('product_variants').select('id, name').in('id', vids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    wids.length
      ? admin.from('warehouses').select('id, name').in('id', wids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const vm = new Map((v.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const wm = new Map((w.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const out: ValuationRow[] = rows
    .map((r) => ({
      productId: String(r.product_id),
      productName: pm.get(String(r.product_id)) ?? '',
      variantName: r.variant_id ? (vm.get(String(r.variant_id)) ?? '') : '',
      warehouseName: wm.get(String(r.warehouse_id)) ?? '',
      quantity: dec(r.quantity),
      value: dec(r.value),
      method: (r.method === 'fifo'
        ? 'fifo'
        : r.method === 'lifo'
          ? 'lifo'
          : 'average') as ValuationRow['method'],
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
  return { rows: out, total: Money.sum(out.map((r) => Money.parse(r.value))).toDbString() };
}

export interface CogsRow {
  productId: string;
  productName: string;
  quantity: string;
  cost: string;
}

/** Cost of goods sold in a period: sales and issues, less goods that came back from clients. */
export async function cogsReport(
  companyId: string,
  range: { from: string; to: string },
): Promise<{ rows: CogsRow[]; total: string }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('stock_movements')
    .select('product_id, kind, quantity_delta, cost_total')
    .eq('company_id', companyId)
    .in('kind', ['sale', 'issue', 'return_in'])
    .gte('created_at', `${range.from}T00:00:00Z`)
    .lt(
      'created_at',
      `${new Date(Date.parse(`${range.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`,
    )
    .limit(10000);
  if (error) throw new InternalError(error);
  const by = new Map<string, { qty: Money; cost: Money }>();
  for (const r of data ?? []) {
    // return_in only counts when it undoes a sale or issue, which has a reference
    const sign = r.kind === 'return_in' ? -1 : 1;
    const qty = Money.parseRounded(String(r.quantity_delta)).abs();
    const cost = Money.parseRounded(String(r.cost_total ?? '0'));
    const cur = by.get(String(r.product_id)) ?? { qty: Money.zero(), cost: Money.zero() };
    by.set(String(r.product_id), {
      qty: sign === 1 ? cur.qty.add(qty) : cur.qty.sub(qty),
      cost: sign === 1 ? cur.cost.add(cost) : cur.cost.sub(cost),
    });
  }
  const ids = [...by.keys()];
  const names = new Map<string, string>();
  if (ids.length) {
    const p = await admin.from('products').select('id, name').in('id', ids);
    for (const x of p.data ?? []) names.set(String(x.id), String(x.name));
  }
  const rows = ids
    .map((id) => ({
      productId: id,
      productName: names.get(id) ?? '',
      quantity: (by.get(id)?.qty ?? Money.zero()).toDbString(),
      cost: (by.get(id)?.cost ?? Money.zero()).toDbString(),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
  return { rows, total: Money.sum(rows.map((r) => Money.parse(r.cost))).toDbString() };
}

export interface ExpiringBatch {
  productId: string;
  productName: string;
  warehouseName: string;
  batchNo: string;
  expiresOn: string;
  quantity: string;
  expired: boolean;
}

export async function expiringBatches(companyId: string, days: number): Promise<ExpiringBatch[]> {
  const admin = getAdminSupabase();
  const limit = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('stock_cost_layers')
    .select('product_id, warehouse_id, batch_no, expires_on, qty_remaining')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gt('qty_remaining', 0)
    .not('expires_on', 'is', null)
    .lte('expires_on', limit)
    .order('expires_on')
    .limit(200);
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const pids = [...new Set(rows.map((r) => String(r.product_id)))];
  const wids = [...new Set(rows.map((r) => String(r.warehouse_id)))];
  const [p, w] = await Promise.all([
    pids.length
      ? admin.from('products').select('id, name').in('id', pids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    wids.length
      ? admin.from('warehouses').select('id, name').in('id', wids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const wm = new Map((w.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    productId: String(r.product_id),
    productName: pm.get(String(r.product_id)) ?? '',
    warehouseName: wm.get(String(r.warehouse_id)) ?? '',
    batchNo: r.batch_no ? String(r.batch_no) : '-',
    expiresOn: String(r.expires_on),
    quantity: dec(r.qty_remaining),
    expired: String(r.expires_on) < today,
  }));
}

/** Job: tells each company once about batches that expire within 14 days or already expired. */
export async function notifyExpiring(): Promise<number> {
  const admin = getAdminSupabase();
  const limit = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('stock_cost_layers')
    .select('id, company_id, product_id, batch_no, expires_on')
    .is('deleted_at', null)
    .is('expiry_notified_at', null)
    .gt('qty_remaining', 0)
    .not('expires_on', 'is', null)
    .lte('expires_on', limit)
    .limit(200);
  if (error) throw new InternalError(error);
  let sent = 0;
  for (const l of data ?? []) {
    const claim = await admin
      .from('stock_cost_layers')
      .update({ expiry_notified_at: new Date().toISOString() })
      .eq('id', String(l.id))
      .is('expiry_notified_at', null)
      .select('id');
    if (claim.error || !claim.data || claim.data.length === 0) continue;
    const p = await admin
      .from('products')
      .select('name')
      .eq('id', String(l.product_id))
      .maybeSingle();
    await getService('notification')
      .notify({
        companyId: String(l.company_id),
        type: 'stock.expiring',
        title: `Batch expires on ${String(l.expires_on)}`,
        body: `${String(p.data?.name ?? 'An item')}, batch ${l.batch_no ? String(l.batch_no) : '-'}`,
        href: '/inventory/valuation',
      })
      .catch(() => undefined);
    sent += 1;
  }
  return sent;
}
