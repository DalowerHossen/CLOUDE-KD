// path: services/inventory/stock.ts
// Stock levels and changes. Every change goes through a database function that locks the level row, so two requests
// can never both take the last unit. The ledger of movements is append only. Low and out-of-stock notices go to the
// company through the notification contract.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  LEDGER_PAGE,
  type AdjustInput,
  type LevelsQuery,
  type MovementsQuery,
  type ReceiveInput,
  type TransferInput,
} from '@/lib/stock/stock';
import { decodeCursor, encodeCursor } from '@/lib/crm/search';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { ensureDefaultWarehouse } from './warehouses';

const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export interface LevelRow {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: string;
  reorderLevel: string | null;
  state: 'ok' | 'low' | 'out';
}

export interface MovementRow {
  id: string;
  at: string;
  productId: string;
  productName: string;
  variantName: string;
  warehouseName: string;
  kind: string;
  delta: string;
  balance: string;
  reason: string | null;
  note: string;
  referenceType: string | null;
}

interface MoveResult {
  movementId: string | null;
  balance: string;
  alert: 'low' | 'out' | null;
  applied: string;
  replay: boolean;
}

function mapMoveError(error: { code?: string; message?: string }): never {
  if (error.code === 'KD001') {
    const m = /available (-?[0-9.]+)/.exec(error.message ?? '');
    throw new ValidationError(
      m?.[1] ? `Not enough stock. Available: ${dec(m[1])}.` : 'Not enough stock.',
    );
  }
  if (error.code === '22023')
    throw new ValidationError('The stock change is not valid for this item or warehouse.');
  throw new InternalError(error);
}

async function notifyAlert(
  companyId: string,
  productId: string,
  state: 'low' | 'out',
): Promise<void> {
  const { data } = await getAdminSupabase()
    .from('products')
    .select('name')
    .eq('id', productId)
    .maybeSingle();
  const name = String(data?.name ?? 'An item');
  await getService('notification')
    .notify({
      companyId,
      type: state === 'out' ? 'stock.out' : 'stock.low',
      title: state === 'out' ? `Out of stock: ${name}` : `Low stock: ${name}`,
      body:
        state === 'out'
          ? 'There is none left in a warehouse.'
          : 'The stock reached the reorder level.',
      href: `/products/${productId}`,
    })
    .catch(() => undefined);
}

async function move(
  companyId: string,
  args: {
    productId: string;
    variantId: string | null;
    warehouseId: string;
    delta: string | null;
    target: string | null;
    kind: string;
    reason: string | null;
    refType: string | null;
    refId: string | null;
    note: string;
    by: string | null;
    key: string | null;
    unitCost: string | null;
  },
): Promise<MoveResult> {
  const { data, error } = await getAdminSupabase().rpc('kd_stock_move', {
    p_company: companyId,
    p_product: args.productId,
    p_variant: args.variantId,
    p_warehouse: args.warehouseId,
    p_delta: args.delta,
    p_target: args.target,
    p_kind: args.kind,
    p_reason: args.reason,
    p_ref_type: args.refType,
    p_ref_id: args.refId,
    p_note: args.note,
    p_by: args.by,
    p_key: args.key,
    p_unit_cost: args.unitCost,
  });
  if (error) mapMoveError(error);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!r) throw new InternalError(new Error('stock move returned nothing'));
  const result: MoveResult = {
    movementId: r.movement_id ? String(r.movement_id) : null,
    balance: dec(r.balance),
    alert: r.alert === 'low' || r.alert === 'out' ? r.alert : null,
    applied: dec(r.applied),
    replay: r.replay === true,
  };
  if (result.alert) await notifyAlert(companyId, args.productId, result.alert);
  return result;
}

/** Manual correction: set the counted quantity, or add or remove a quantity. A reason is always recorded. */
export async function adjustStock(actor: Actor, input: AdjustInput): Promise<MoveResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const result = await move(companyId, {
    productId: input.productId,
    variantId: input.variantId,
    warehouseId: input.warehouseId,
    delta: input.mode === 'change' ? input.quantity : null,
    target: input.mode === 'set' ? input.quantity : null,
    kind: 'adjustment',
    reason: input.reason,
    refType: null,
    refId: null,
    note: input.note,
    by: actor.userId,
    key: null,
    unitCost: null,
  });
  await getService('audit').record({
    action: 'stock.adjusted',
    resourceType: 'product',
    resourceId: input.productId,
    companyId,
    metadata: { reason: input.reason, applied: result.applied, by: actor.userId },
  });
  return result;
}

export async function transferStock(
  actor: Actor,
  input: TransferInput,
): Promise<{ outBalance: string; inBalance: string }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase().rpc('kd_stock_transfer', {
    p_company: companyId,
    p_product: input.productId,
    p_variant: input.variantId,
    p_from: input.fromWarehouseId,
    p_to: input.toWarehouseId,
    p_qty: input.quantity,
    p_by: actor.userId,
    p_key: null,
    p_note: input.note,
  });
  if (error) mapMoveError(error);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  await getService('audit').record({
    action: 'stock.transferred',
    resourceType: 'product',
    resourceId: input.productId,
    companyId,
    metadata: {
      quantity: input.quantity,
      from: input.fromWarehouseId,
      to: input.toWarehouseId,
      by: actor.userId,
    },
  });
  return { outBalance: dec(r?.out_balance), inBalance: dec(r?.in_balance) };
}

export interface StockLine {
  productId: string;
  variantId?: string | null;
  warehouseId?: string | null;
  quantity: string;
}

/** Takes (direction "out") or gives back (direction "in") stock for many lines at once: all or none. Used by the
 * workers that follow invoices and purchase receipts. Items that do not track stock are skipped. */
export async function moveLines(
  companyId: string,
  input: {
    lines: StockLine[];
    direction: 'out' | 'in';
    kind: 'sale' | 'issue' | 'return_in' | 'return_out' | 'receipt';
    referenceType: string;
    referenceId: string | null;
    by: string | null;
    key: string | null;
  },
): Promise<{ alerts: { productId: string; state: 'low' | 'out' }[] }> {
  await ensureDefaultWarehouse(companyId);
  const { data, error } = await getAdminSupabase().rpc('kd_stock_move_many', {
    p_company: companyId,
    p_lines: input.lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId ?? '',
      warehouseId: l.warehouseId ?? '',
      quantity: l.quantity,
    })),
    p_direction: input.direction,
    p_kind: input.kind,
    p_ref_type: input.referenceType,
    p_ref_id: input.referenceId,
    p_by: input.by,
    p_key: input.key,
  });
  if (error) mapMoveError(error);
  const alerts = ((data ?? []) as { productId: string; state: string }[])
    .filter((a) => a.state === 'low' || a.state === 'out')
    .map((a) => ({ productId: String(a.productId), state: a.state as 'low' | 'out' }));
  for (const a of alerts) await notifyAlert(companyId, a.productId, a.state);
  return { alerts };
}

export async function listLevels(companyId: string, query: LevelsQuery): Promise<LevelRow[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('stock_levels')
    .select('product_id, variant_id, warehouse_id, quantity, alert_state')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('quantity')
    .limit(500);
  if (query.warehouseId) q = q.eq('warehouse_id', query.warehouseId);
  if (query.productId) q = q.eq('product_id', query.productId);
  if (query.low === '1') q = q.in('alert_state', ['low', 'out']);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const pids = [...new Set(rows.map((r) => String(r.product_id)))];
  const vids = [...new Set(rows.flatMap((r) => (r.variant_id ? [String(r.variant_id)] : [])))];
  const wids = [...new Set(rows.map((r) => String(r.warehouse_id)))];
  const [p, v, w] = await Promise.all([
    pids.length
      ? admin.from('products').select('id, name, sku, reorder_level').in('id', pids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    vids.length
      ? admin.from('product_variants').select('id, name').in('id', vids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    wids.length
      ? admin.from('warehouses').select('id, name').in('id', wids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), x]));
  const vm = new Map((v.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const wm = new Map((w.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const needle = query.q?.toLowerCase();
  return rows
    .map((r): LevelRow => {
      const prod = pm.get(String(r.product_id));
      return {
        productId: String(r.product_id),
        variantId: r.variant_id ? String(r.variant_id) : null,
        productName: String(prod?.name ?? ''),
        variantName: r.variant_id ? (vm.get(String(r.variant_id)) ?? '') : '',
        sku: prod?.sku ? String(prod.sku) : null,
        warehouseId: String(r.warehouse_id),
        warehouseName: wm.get(String(r.warehouse_id)) ?? '',
        quantity: dec(r.quantity),
        reorderLevel:
          prod?.reorder_level === null || prod?.reorder_level === undefined
            ? null
            : dec(prod.reorder_level),
        state: r.alert_state === 'low' || r.alert_state === 'out' ? r.alert_state : 'ok',
      };
    })
    .filter(
      (r) =>
        !needle ||
        r.productName.toLowerCase().includes(needle) ||
        (r.sku ?? '').toLowerCase().includes(needle),
    );
}

/** Stock of one product by warehouse and variant, for the product page. */
export async function productStock(companyId: string, productId: string): Promise<LevelRow[]> {
  return listLevels(companyId, { productId });
}

export async function listMovements(
  companyId: string,
  query: MovementsQuery,
): Promise<{ rows: MovementRow[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  let q = admin
    .from('stock_movements')
    .select(
      'id, created_at, product_id, variant_id, warehouse_id, kind, quantity_delta, balance_after, reason, note, reference_type',
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LEDGER_PAGE + 1);
  if (query.productId) q = q.eq('product_id', query.productId);
  if (query.warehouseId) q = q.eq('warehouse_id', query.warehouseId);
  if (query.kind) q = q.eq('kind', query.kind);
  if (cursor)
    q = q.or(`created_at.lt."${cursor.v}",and(created_at.eq."${cursor.v}",id.lt.${cursor.id})`);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const all = data ?? [];
  const page = all.slice(0, LEDGER_PAGE);
  const pids = [...new Set(page.map((r) => String(r.product_id)))];
  const vids = [...new Set(page.flatMap((r) => (r.variant_id ? [String(r.variant_id)] : [])))];
  const wids = [...new Set(page.map((r) => String(r.warehouse_id)))];
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
  const rows: MovementRow[] = page.map((r) => ({
    id: String(r.id),
    at: String(r.created_at),
    productId: String(r.product_id),
    productName: pm.get(String(r.product_id)) ?? '',
    variantName: r.variant_id ? (vm.get(String(r.variant_id)) ?? '') : '',
    warehouseName: wm.get(String(r.warehouse_id)) ?? '',
    kind: String(r.kind),
    delta: dec(r.quantity_delta),
    balance: dec(r.balance_after),
    reason: r.reason ? String(r.reason) : null,
    note: String(r.note ?? ''),
    referenceType: r.reference_type ? String(r.reference_type) : null,
  }));
  const last = page[page.length - 1];
  return {
    rows,
    next:
      all.length > LEDGER_PAGE && last
        ? encodeCursor({ v: String(last.created_at), id: String(last.id) })
        : null,
  };
}

export async function setReorderLevel(
  actor: Actor,
  productId: string,
  level: string | null,
): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const r = await getAdminSupabase()
    .from('products')
    .update({ reorder_level: level })
    .eq('id', productId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'stock.reorder_level_set',
    resourceType: 'product',
    resourceId: productId,
    companyId,
    metadata: { by: actor.userId },
  });
}

/** Stock that arrived: adds a cost layer with the cost, the batch and the expiry date. */
export async function receiveStock(actor: Actor, input: ReceiveInput): Promise<MoveResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (input.expiresOn && input.expiresOn < new Date().toISOString().slice(0, 10))
    throw new ValidationError('This batch has already expired.');
  const { data, error } = await getAdminSupabase().rpc('kd_stock_apply', {
    p_company: companyId,
    p_product: input.productId,
    p_variant: input.variantId,
    p_warehouse: input.warehouseId,
    p_delta: input.quantity,
    p_target: null,
    p_kind: 'receipt',
    p_reason: null,
    p_ref_type: 'manual',
    p_ref_id: null,
    p_note: input.note,
    p_by: actor.userId,
    p_key: null,
    p_unit_cost: input.unitCost,
    p_batch: input.batchNo,
    p_expires: input.expiresOn,
    p_source_movement: null,
  });
  if (error) mapMoveError(error);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!r) throw new InternalError(new Error('stock receipt returned nothing'));
  await getService('audit').record({
    action: 'stock.received',
    resourceType: 'product',
    resourceId: input.productId,
    companyId,
    metadata: { quantity: input.quantity, batch: input.batchNo, by: actor.userId },
  });
  return {
    movementId: r.movement_id ? String(r.movement_id) : null,
    balance: dec(r.balance),
    alert: null,
    applied: dec(r.applied),
    replay: r.replay === true,
  };
}
