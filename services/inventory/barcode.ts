// path: services/inventory/barcode.ts
// Finds an item or variant from a scanned barcode or a typed SKU.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface ScanHit {
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string;
  sku: string | null;
  trackInventory: boolean;
}

export async function lookupCode(companyId: string, code: string): Promise<ScanHit | null> {
  const admin = getAdminSupabase();
  const v = await admin
    .from('product_variants')
    .select('id, product_id, name, sku, barcode')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .or(`barcode.eq."${code}",sku.ilike."${code.replace(/[%_\\]/g, '')}"`)
    .limit(1);
  if (v.error) throw new InternalError(v.error);
  const variant = v.data?.[0];
  const productFilter = variant ? String(variant.product_id) : null;
  const p = productFilter
    ? await admin
        .from('products')
        .select('id, name, sku, track_inventory')
        .eq('id', productFilter)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .limit(1)
    : await admin
        .from('products')
        .select('id, name, sku, track_inventory')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .or(`barcode.eq."${code}",sku.ilike."${code.replace(/[%_\\]/g, '')}"`)
        .limit(1);
  if (p.error) throw new InternalError(p.error);
  const product = p.data?.[0];
  if (!product) return null;
  return {
    productId: String(product.id),
    variantId: variant ? String(variant.id) : null,
    name: String(product.name),
    variantName: variant ? String(variant.name) : '',
    sku: variant?.sku ? String(variant.sku) : product.sku ? String(product.sku) : null,
    trackInventory: product.track_inventory === true,
  };
}
