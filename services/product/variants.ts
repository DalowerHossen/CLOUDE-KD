// path: services/product/variants.ts
// Variants of a product (size, colour, ...): each has its own SKU, barcode and optional price. Saving the list
// adds, changes and removes variants in one go; a variant that is not in the list is removed.
import 'server-only';
import { getService } from '@/lib/container';
import { DuplicateError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { variantHooks } from '@/lib/catalog/variant-hooks';

export interface VariantView {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitPrice: string | null;
  attributes: Record<string, string>;
  isActive: boolean;
}

export interface VariantInput {
  id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitPrice: string | null;
  attributes: Record<string, string>;
  isActive: boolean;
}

const COLUMNS = 'id, name, sku, barcode, unit_price, attributes, is_active';
const view = (r: Record<string, unknown>): VariantView => ({
  id: String(r.id),
  name: String(r.name),
  sku: r.sku ? String(r.sku) : null,
  barcode: r.barcode ? String(r.barcode) : null,
  unitPrice:
    r.unit_price === null || r.unit_price === undefined
      ? null
      : Money.parseRounded(String(r.unit_price)).toDbString(),
  attributes: (r.attributes ?? {}) as Record<string, string>,
  isActive: r.is_active === true,
});

export async function listVariants(companyId: string, productId: string): Promise<VariantView[]> {
  const { data, error } = await getAdminSupabase()
    .from('product_variants')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw new InternalError(error);
  return (data ?? []).map(view);
}

export async function saveVariants(
  actor: Actor,
  productId: string,
  list: VariantInput[],
): Promise<VariantView[]> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const product = await admin
    .from('products')
    .select('id, kind')
    .eq('id', productId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (product.error) throw new InternalError(product.error);
  if (!product.data) throw new NotFoundError();
  if (product.data.kind !== 'product')
    throw new ValidationError('Only physical products have variants.');
  const current = await listVariants(companyId, productId);
  const keep = new Set(list.flatMap((v) => (v.id ? [v.id] : [])));
  for (const id of keep) if (!current.some((c) => c.id === id)) throw new NotFoundError();
  for (const old of current.filter((c) => !keep.has(c.id))) {
    for (const guard of variantHooks()) {
      const reason = await guard(companyId, old.id);
      if (reason) throw new ValidationError(`${old.name}: ${reason}`);
    }
  }
  for (const old of current.filter((c) => !keep.has(c.id))) {
    const r = await admin
      .from('product_variants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', old.id)
      .eq('company_id', companyId);
    if (r.error) throw new InternalError(r.error);
  }
  for (const v of list) {
    const row = {
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      unit_price: v.unitPrice,
      attributes: v.attributes,
      is_active: v.isActive,
    };
    const r = v.id
      ? await admin.from('product_variants').update(row).eq('id', v.id).eq('company_id', companyId)
      : await admin
          .from('product_variants')
          .insert({ company_id: companyId, product_id: productId, ...row });
    if (r.error) {
      if (r.error.code === '23505')
        throw new DuplicateError('Another variant or product already uses this SKU or barcode.');
      throw new InternalError(r.error);
    }
  }
  await getService('audit').record({
    action: 'product.variants_saved',
    resourceType: 'product',
    resourceId: productId,
    companyId,
    metadata: { count: list.length, by: actor.userId },
  });
  return listVariants(companyId, productId);
}
