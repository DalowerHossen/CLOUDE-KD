// path: services/product/products.ts
// Products, services and bundles. Every query carries the company of the signed-in person. A change needs the version
// the editor loaded. Prices are US dollars in decimal text; the database stores numeric(18,4).
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { productDeleteGuards } from '@/lib/catalog/hooks';
import type { ProductInput } from '@/lib/catalog/products';
import { checkCustomValues } from '@/lib/crm/custom-values';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { listDefs } from '@/services/client/custom-fields';

export interface BundleItemView {
  productId: string;
  name: string;
  quantity: string;
}
export interface ProductView {
  id: string;
  kind: 'product' | 'service' | 'bundle';
  name: string;
  description: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  unitPrice: string;
  costPrice: string;
  taxCategory: string;
  taxRate: string;
  categoryId: string | null;
  hsCode: string;
  trackInventory: boolean;
  reorderLevel: string | null;
  valuationMethod: 'average' | 'fifo' | 'lifo';
  status: 'active' | 'inactive' | 'archived';
  customFields: Record<string, string | number | boolean | null>;
  imageFileIds: string[];
  volumeTiers: { minQty: string; unitPrice: string }[];
  bundleItems: BundleItemView[];
  version: number;
  createdAt: string;
}

export const PRODUCT_COLUMNS =
  'id, kind, name, description, sku, barcode, unit, unit_price, cost_price, tax_category, tax_rate, category_id, hs_code, track_inventory, reorder_level, valuation_method, status, custom_fields, image_file_ids, volume_tiers, version, created_at';

type Row = Record<string, unknown>;
const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export function toProductView(r: Row, bundleItems: BundleItemView[]): ProductView {
  const tiers = Array.isArray(r.volume_tiers)
    ? (r.volume_tiers as { minQty: string; unitPrice: string }[])
    : [];
  return {
    id: String(r.id),
    kind: String(r.kind) as ProductView['kind'],
    name: String(r.name),
    description: String(r.description ?? ''),
    sku: r.sku ? String(r.sku) : null,
    barcode: r.barcode ? String(r.barcode) : null,
    unit: String(r.unit),
    unitPrice: dec(r.unit_price),
    costPrice: dec(r.cost_price),
    taxCategory: String(r.tax_category),
    taxRate: dec(r.tax_rate),
    categoryId: r.category_id ? String(r.category_id) : null,
    hsCode: String(r.hs_code ?? ''),
    trackInventory: r.track_inventory === true,
    reorderLevel:
      r.reorder_level === null || r.reorder_level === undefined ? null : dec(r.reorder_level),
    valuationMethod:
      r.valuation_method === 'fifo' ? 'fifo' : r.valuation_method === 'lifo' ? 'lifo' : 'average',
    status: String(r.status) as ProductView['status'],
    customFields: (r.custom_fields ?? {}) as ProductView['customFields'],
    imageFileIds: (r.image_file_ids as string[] | null) ?? [],
    volumeTiers: tiers.map((t) => ({ minQty: dec(t.minQty), unitPrice: dec(t.unitPrice) })),
    bundleItems,
    version: Math.trunc(Number(r.version)),
    createdAt: String(r.created_at),
  };
}

function needCompany(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function bundleItemsOf(companyId: string, bundleId: string): Promise<BundleItemView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('product_bundle_items')
    .select('item_product_id, quantity')
    .eq('company_id', companyId)
    .eq('bundle_id', bundleId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.item_product_id));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const p = await admin.from('products').select('id, name').in('id', ids);
    for (const x of p.data ?? []) names.set(String(x.id), String(x.name));
  }
  return (data ?? []).map((r) => ({
    productId: String(r.item_product_id),
    name: names.get(String(r.item_product_id)) ?? '',
    quantity: dec(r.quantity),
  }));
}

export async function getProduct(companyId: string, id: string): Promise<ProductView> {
  const { data, error } = await getAdminSupabase()
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const row = data as unknown as Row;
  return toProductView(row, row.kind === 'bundle' ? await bundleItemsOf(companyId, id) : []);
}

async function assertCategory(companyId: string, categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const { data, error } = await getAdminSupabase()
    .from('product_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new ValidationError('Choose one of your categories.');
}

async function assertBundleItems(
  companyId: string,
  input: ProductInput,
  selfId: string | null,
): Promise<void> {
  if (input.bundleItems.length === 0) return;
  const ids = input.bundleItems.map((i) => i.productId);
  if (selfId && ids.includes(selfId)) throw new ValidationError('A bundle cannot contain itself.');
  const { data, error } = await getAdminSupabase()
    .from('products')
    .select('id, kind')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('id', ids);
  if (error) throw new InternalError(error);
  if ((data ?? []).length !== ids.length)
    throw new ValidationError('Some bundle items were not found.');
  if ((data ?? []).some((r) => r.kind === 'bundle'))
    throw new ValidationError('A bundle cannot contain another bundle.');
}

function columns(input: ProductInput): Row {
  return {
    kind: input.kind,
    name: input.name,
    description: input.description,
    sku: input.sku,
    barcode: input.barcode,
    unit: input.unit,
    unit_price: input.unitPrice,
    cost_price: input.costPrice,
    tax_category: input.taxCategory,
    tax_rate: input.taxRate,
    category_id: input.categoryId,
    hs_code: input.hsCode,
    track_inventory: input.trackInventory,
    valuation_method: input.valuationMethod,
    status: input.status,
    volume_tiers: input.volumeTiers,
  };
}

function uniqueMessage(error: { code?: string; message?: string }): never {
  const text = error.message ?? '';
  if (text.includes('uq_product_sku'))
    throw new DuplicateError('Another product already uses this SKU.');
  if (text.includes('uq_product_barcode'))
    throw new DuplicateError('Another product already uses this barcode.');
  throw new DuplicateError('This value is already used by another product.');
}

export async function createProduct(
  actor: Actor,
  input: ProductInput,
  confirmDuplicate: boolean,
): Promise<ProductView> {
  const companyId = needCompany(actor);
  await assertCategory(companyId, input.categoryId);
  await assertBundleItems(companyId, input, null);
  const custom = checkCustomValues(await listDefs(companyId, 'product'), input.customFields);
  if (!confirmDuplicate) {
    const similar = await findProductDuplicates(companyId, {
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
    });
    // An exact SKU or barcode match is also refused by the database; the name match only warns.
    if (similar.length > 0)
      throw new DuplicateError(
        'A similar item already exists. Check the list, or confirm to create it anyway.',
        similar,
      );
  }
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('products')
    .insert({
      company_id: companyId,
      created_by: actor.userId,
      custom_fields: custom,
      ...columns(input),
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') uniqueMessage(error);
    throw new InternalError(error);
  }
  const id = String(data.id);
  if (input.kind === 'bundle') await saveBundle(companyId, id, input);
  await getService('audit').record({
    action: 'product.created',
    resourceType: 'product',
    resourceId: id,
    companyId,
    metadata: { kind: input.kind, by: actor.userId },
  });
  return getProduct(companyId, id);
}

async function saveBundle(companyId: string, bundleId: string, input: ProductInput): Promise<void> {
  const r = await getAdminSupabase().rpc('kd_bundle_items_replace', {
    p_company: companyId,
    p_bundle: bundleId,
    p_rows: input.bundleItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  });
  if (r.error) {
    if (r.error.code === '22023') throw new ValidationError('The bundle items are not valid.');
    throw new InternalError(r.error);
  }
}

export async function updateProduct(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: ProductInput,
): Promise<ProductView> {
  const companyId = needCompany(actor);
  const current = await getProduct(companyId, id);
  if (current.kind !== input.kind)
    throw new ValidationError('The kind of an item cannot be changed. Create a new item instead.');
  await assertCategory(companyId, input.categoryId);
  await assertBundleItems(companyId, input, id);
  const custom = checkCustomValues(await listDefs(companyId, 'product'), input.customFields);
  const r = await getAdminSupabase()
    .from('products')
    .update({ ...columns(input), custom_fields: custom })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select('id');
  if (r.error) {
    if (r.error.code === '23505') uniqueMessage(r.error);
    throw new InternalError(r.error);
  }
  if (!r.data || r.data.length === 0) throw new ConflictError();
  if (input.kind === 'bundle') await saveBundle(companyId, id, input);
  await getService('audit').record({
    action: 'product.updated',
    resourceType: 'product',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getProduct(companyId, id);
}

export async function setProductStatus(
  actor: Actor,
  id: string,
  status: ProductView['status'],
): Promise<ProductView> {
  const companyId = needCompany(actor);
  const r = await getAdminSupabase()
    .from('products')
    .update({ status })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: `product.${status}`,
    resourceType: 'product',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getProduct(companyId, id);
}

/** Soft delete. A registered guard (for example "the product is on an invoice") blocks it; archive instead. */
export async function deleteProduct(actor: Actor, id: string): Promise<void> {
  const companyId = needCompany(actor);
  await getProduct(companyId, id);
  for (const guard of productDeleteGuards()) {
    const reason = await guard(companyId, id);
    if (reason) throw new ValidationError(`${reason} Archive the item instead.`);
  }
  const admin = getAdminSupabase();
  const used = await admin
    .from('product_bundle_items')
    .select('id', { count: 'exact', head: true })
    .eq('item_product_id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if ((used.count ?? 0) > 0)
    throw new ValidationError(
      'This item is part of a bundle. Remove it from the bundle first, or archive it.',
    );
  const r = await admin
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await admin
    .from('product_variants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('product_id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  await getService('audit').record({
    action: 'product.deleted',
    resourceType: 'product',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export interface ProductDuplicate {
  id: string;
  name: string;
  sku: string | null;
  reason: 'sku' | 'barcode' | 'name';
  score: number;
}

export async function findProductDuplicates(
  companyId: string,
  input: { name: string; sku?: string | null; barcode?: string | null; exclude?: string | null },
): Promise<ProductDuplicate[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_product_duplicates', {
    p_company: companyId,
    p_name: input.name,
    p_sku: input.sku ?? null,
    p_barcode: input.barcode ?? null,
    p_exclude: input.exclude ?? null,
  });
  if (error) throw new InternalError(error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    sku: r.sku ? String(r.sku) : null,
    reason: String(r.reason) as ProductDuplicate['reason'],
    score: Math.round(Number(r.score) * 100) / 100,
  }));
}
