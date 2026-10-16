// path: services/import/targets/products.ts
// Products and services as an import and export target. A duplicate is an item with the same SKU, else the same
// barcode, else the same name (ignoring case). The category is given by name and must already exist.
import 'server-only';
import { productInputSchema, type ProductInput } from '@/lib/catalog/products';
import { deepMerge } from '@/lib/transfer/rows';
import { PRODUCT_FIELDS, parseProductRow, type ParsedProduct } from '@/lib/transfer/targets';
import type { ImportTarget } from '@/lib/transfer/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError, ValidationError } from '@/lib/errors';
import {
  PRODUCT_COLUMNS,
  createProduct,
  getProduct,
  updateProduct,
  type ProductView,
} from '@/services/product/products';
import { EXPORT_LIMIT, filterText, likeExact } from './shared';

function viewToInput(p: ProductView): ProductInput {
  return productInputSchema.parse({
    kind: p.kind,
    name: p.name,
    description: p.description,
    sku: p.sku ?? '',
    barcode: p.barcode ?? '',
    unit: p.unit,
    unitPrice: p.unitPrice,
    costPrice: p.costPrice,
    taxCategory: p.taxCategory,
    taxRate: p.taxRate,
    categoryId: p.categoryId,
    hsCode: p.hsCode,
    trackInventory: p.trackInventory,
    valuationMethod: p.valuationMethod,
    status: p.status,
    customFields: p.customFields,
    volumeTiers: p.volumeTiers,
    bundleItems: p.bundleItems.map((b) => ({ productId: b.productId, quantity: b.quantity })),
  });
}

async function firstId(
  companyId: string,
  column: string,
  value: string,
  exact: boolean,
): Promise<string | null> {
  let q = getAdminSupabase()
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(1);
  q = exact ? q.eq(column, value) : q.ilike(column, likeExact(value));
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return data?.[0] ? String(data[0].id) : null;
}

async function categoryId(companyId: string, name: string): Promise<string | null> {
  if (!name) return null;
  const { data, error } = await getAdminSupabase()
    .from('product_categories')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .ilike('name', likeExact(name))
    .limit(1);
  if (error) throw new InternalError(error);
  if (!data?.[0])
    throw new ValidationError(`The category "${name}" does not exist. Create it first.`);
  return String(data[0].id);
}

export const productsTarget: ImportTarget<ParsedProduct> = {
  id: 'products',
  writePermission: 'product.create',
  readPermission: 'product.read',
  resourceType: 'product',
  fields: PRODUCT_FIELDS,
  parse: (row) => parseProductRow(row),
  fileKey: (v) =>
    v.input.sku
      ? `s:${v.input.sku.toLowerCase()}`
      : v.input.barcode
        ? `b:${v.input.barcode}`
        : `n:${v.input.name.toLowerCase()}`,
  async findDuplicate(companyId, v) {
    if (v.input.sku) {
      const hit = await firstId(companyId, 'sku', v.input.sku, false);
      if (hit) return hit;
    }
    if (v.input.barcode) {
      const hit = await firstId(companyId, 'barcode', v.input.barcode, true);
      if (hit) return hit;
    }
    return firstId(companyId, 'name', v.input.name, false);
  },
  async create(actor, v) {
    if (!actor.companyId) throw new ValidationError('A company is needed.');
    const input = { ...v.input, categoryId: await categoryId(actor.companyId, v.categoryName) };
    return (await createProduct(actor, input, true)).id;
  },
  async update(actor, id, v) {
    if (!actor.companyId) return;
    const current = await getProduct(actor.companyId, id);
    const { categoryName: _name, ...patch } = v.patch;
    void _name;
    const merged = productInputSchema.parse(
      deepMerge(
        { ...viewToInput(current), kind: current.kind } as unknown as Record<string, unknown>,
        { ...patch, kind: current.kind },
      ),
    );
    const withCategory = v.categoryName
      ? { ...merged, categoryId: await categoryId(actor.companyId, v.categoryName) }
      : merged;
    await updateProduct(actor, id, current.version, withCategory);
  },
  exportColumns: [...PRODUCT_FIELDS.map((f) => ({ key: f.key, label: f.label }))],
  async exportRows(companyId, filter) {
    let q = getAdminSupabase()
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name')
      .limit(EXPORT_LIMIT);
    if (filter.status === 'active' || filter.status === 'inactive' || filter.status === 'archived')
      q = q.eq('status', filter.status);
    const text = filterText(filter.q ?? '');
    if (text) q = q.or(`name.ilike.%${text}%,sku.ilike.%${text}%,barcode.ilike.%${text}%`);
    const { data, error } = await q;
    if (error) throw new InternalError(error);
    const cats = await getAdminSupabase()
      .from('product_categories')
      .select('id, name')
      .eq('company_id', companyId);
    const names = new Map((cats.data ?? []).map((c) => [String(c.id), String(c.name)]));
    return (data ?? []).map((r) => {
      const x = r as unknown as Record<string, unknown>;
      return {
        name: String(x.name),
        kind: String(x.kind),
        description: String(x.description ?? ''),
        sku: x.sku ? String(x.sku) : '',
        barcode: x.barcode ? String(x.barcode) : '',
        unit: String(x.unit),
        unit_price: String(x.unit_price),
        cost_price: String(x.cost_price),
        tax_category: String(x.tax_category),
        tax_rate: String(x.tax_rate),
        category: x.category_id ? (names.get(String(x.category_id)) ?? '') : '',
        hs_code: String(x.hs_code ?? ''),
        track_inventory: x.track_inventory === true ? 'yes' : 'no',
        valuation_method: String(x.valuation_method),
        status: String(x.status),
      };
    });
  },
};
