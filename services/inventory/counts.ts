// path: services/inventory/counts.ts
// Stock counts: start a count of one warehouse, enter what was counted, and complete it. Completing sets each counted
// item to the counted quantity (the change is worked out under the lock, so sales during the count are kept) and keeps
// the difference on the count lines.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { formatNumber } from '@/lib/stock/documents';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export interface CountLineView {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  expected: string;
  counted: string | null;
  applied: string | null;
}
export interface CountView {
  id: string;
  number: string;
  status: 'open' | 'completed' | 'cancelled';
  warehouseId: string;
  warehouseName: string;
  note: string;
  startedAt: string;
  completedAt: string | null;
  lines: CountLineView[];
}

type Row = Record<string, unknown>;

export async function listCounts(companyId: string): Promise<Omit<CountView, 'lines'>[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('stock_counts')
    .select('id, number, status, warehouse_id, note, created_at, completed_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  const wids = [...new Set((data ?? []).map((r) => String(r.warehouse_id)))];
  const w = wids.length
    ? await admin.from('warehouses').select('id, name').in('id', wids)
    : { data: [] as Row[] };
  const wm = new Map((w.data ?? []).map((x) => [String(x.id), String(x.name)]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    number: String(r.number),
    status: String(r.status) as CountView['status'],
    warehouseId: String(r.warehouse_id),
    warehouseName: wm.get(String(r.warehouse_id)) ?? '',
    note: String(r.note ?? ''),
    startedAt: String(r.created_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
  }));
}

export async function getCount(companyId: string, id: string): Promise<CountView> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('stock_counts')
    .select('id, number, status, warehouse_id, note, created_at, completed_at')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const l = await admin
    .from('stock_count_lines')
    .select('id, product_id, variant_id, expected_qty, counted_qty, applied_delta')
    .eq('count_id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(2000);
  if (l.error) throw new InternalError(l.error);
  const pids = [...new Set((l.data ?? []).map((r) => String(r.product_id)))];
  const vids = [
    ...new Set((l.data ?? []).flatMap((r) => (r.variant_id ? [String(r.variant_id)] : []))),
  ];
  const [p, v, w] = await Promise.all([
    pids.length
      ? admin.from('products').select('id, name, sku').in('id', pids)
      : Promise.resolve({ data: [] as Row[] }),
    vids.length
      ? admin.from('product_variants').select('id, name').in('id', vids)
      : Promise.resolve({ data: [] as Row[] }),
    admin.from('warehouses').select('name').eq('id', String(data.warehouse_id)).maybeSingle(),
  ]);
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), x]));
  const vm = new Map((v.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const lines: CountLineView[] = (l.data ?? [])
    .map((r) => ({
      id: String(r.id),
      productId: String(r.product_id),
      productName: String(pm.get(String(r.product_id))?.name ?? ''),
      variantName: r.variant_id ? (vm.get(String(r.variant_id)) ?? '') : '',
      sku: pm.get(String(r.product_id))?.sku ? String(pm.get(String(r.product_id))?.sku) : null,
      expected: dec(r.expected_qty),
      counted: r.counted_qty === null || r.counted_qty === undefined ? null : dec(r.counted_qty),
      applied:
        r.applied_delta === null || r.applied_delta === undefined ? null : dec(r.applied_delta),
    }))
    .sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) || a.variantName.localeCompare(b.variantName),
    );
  return {
    id: String(data.id),
    number: String(data.number),
    status: String(data.status) as CountView['status'],
    warehouseId: String(data.warehouse_id),
    warehouseName: String(w.data?.name ?? ''),
    note: String(data.note ?? ''),
    startedAt: String(data.created_at),
    completedAt: data.completed_at ? String(data.completed_at) : null,
    lines,
  };
}

export async function startCount(
  actor: Actor,
  input: { warehouseId: string; note: string },
): Promise<string> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const year = new Date().getUTCFullYear();
  const seq = await admin.rpc('kd_next_number', { p_company: companyId, p_key: `CNT:${year}` });
  if (seq.error) throw new InternalError(seq.error);
  const number = formatNumber('CNT', year, Math.trunc(Number(seq.data)));
  const { data, error } = await admin.rpc('kd_stock_count_start', {
    p_company: companyId,
    p_warehouse: input.warehouseId,
    p_number: number,
    p_by: actor.userId,
    p_note: input.note,
  });
  if (error) {
    if (error.code === '23505')
      throw new ValidationError(
        'A count of this warehouse is already open. Complete or cancel it first.',
      );
    if (error.code === '22023') throw new ValidationError('Choose one of your active warehouses.');
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'stock_count.started',
    resourceType: 'stock_count',
    resourceId: String(data),
    companyId,
    metadata: { number, by: actor.userId },
  });
  return String(data);
}

export async function saveCounted(
  actor: Actor,
  id: string,
  counts: { lineId: string; countedQty: string | null }[],
): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const count = await getCount(companyId, id);
  if (count.status !== 'open') throw new ValidationError('This count is closed.');
  const admin = getAdminSupabase();
  const known = new Set(count.lines.map((l) => l.id));
  for (const c of counts) {
    if (!known.has(c.lineId)) throw new NotFoundError();
    const r = await admin
      .from('stock_count_lines')
      .update({ counted_qty: c.countedQty })
      .eq('id', c.lineId)
      .eq('count_id', id)
      .eq('company_id', companyId);
    if (r.error) throw new InternalError(r.error);
  }
}

export async function completeCount(actor: Actor, id: string): Promise<{ changed: number }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase().rpc('kd_stock_count_complete', {
    p_company: companyId,
    p_count: id,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError('This count cannot be completed.');
    throw new InternalError(error);
  }
  const result = (data ?? {}) as { changed?: number };
  await getService('audit').record({
    action: 'stock_count.completed',
    resourceType: 'stock_count',
    resourceId: id,
    companyId,
    metadata: { changed: result.changed ?? 0, by: actor.userId },
  });
  return { changed: Math.trunc(Number(result.changed ?? 0)) };
}

export async function cancelCount(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const r = await getAdminSupabase()
    .from('stock_counts')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0)
    throw new ValidationError('Only an open count can be cancelled.');
  await getService('audit').record({
    action: 'stock_count.cancelled',
    resourceType: 'stock_count',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}
