// path: services/product/search.ts
// The product list (fuzzy search, filters, sorting, cursor pages) and the small picker used while writing an invoice.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { resolveUnitPrice } from '@/lib/catalog/resolve';
import type { ProductListQuery } from '@/lib/catalog/products';
import { decodeCursor, encodeCursor, PAGE_LIMIT } from '@/lib/crm/search';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface ProductListItem {
  id: string;
  kind: 'product' | 'service' | 'bundle';
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: string;
  status: 'active' | 'inactive' | 'archived';
  categoryName: string;
  trackInventory: boolean;
}

function decimalOrNull(v: string | undefined): string | null {
  if (!v) return null;
  try {
    return Money.parse(v).toDbString();
  } catch {
    return null;
  }
}

export async function searchProducts(
  companyId: string,
  query: ProductListQuery,
): Promise<{ rows: ProductListItem[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  const found = await admin.rpc('kd_product_search', {
    p_company: companyId,
    p_q: query.q ?? null,
    p_status: query.status ?? null,
    p_kind: query.kind ?? null,
    p_category: query.category ?? null,
    p_min: decimalOrNull(query.min),
    p_max: decimalOrNull(query.max),
    p_sort: query.sort,
    p_desc: query.desc === '1',
    p_after_value: cursor?.v ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: PAGE_LIMIT + 1,
  });
  if (found.error) throw new InternalError(found.error);
  const hits = (found.data ?? []) as { id: string; sort_value: string }[];
  const page = hits.slice(0, PAGE_LIMIT);
  if (page.length === 0) return { rows: [], next: null };
  const { data, error } = await admin
    .from('products')
    .select('id, kind, name, sku, unit, unit_price, status, category_id, track_inventory')
    .eq('company_id', companyId)
    .in(
      'id',
      page.map((h) => h.id),
    );
  if (error) throw new InternalError(error);
  const catIds = [
    ...new Set((data ?? []).flatMap((r) => (r.category_id ? [String(r.category_id)] : []))),
  ];
  const cats = new Map<string, string>();
  if (catIds.length > 0) {
    const c = await admin.from('product_categories').select('id, name').in('id', catIds);
    for (const x of c.data ?? []) cats.set(String(x.id), String(x.name));
  }
  const byId = new Map((data ?? []).map((r) => [String(r.id), r]));
  const rows: ProductListItem[] = [];
  for (const h of page) {
    const r = byId.get(h.id);
    if (!r) continue;
    rows.push({
      id: String(r.id),
      kind: String(r.kind) as ProductListItem['kind'],
      name: String(r.name),
      sku: r.sku ? String(r.sku) : null,
      unit: String(r.unit),
      unitPrice: Money.parseRounded(String(r.unit_price)).toDbString(),
      status: String(r.status) as ProductListItem['status'],
      categoryName: r.category_id ? (cats.get(String(r.category_id)) ?? '') : '',
      trackInventory: r.track_inventory === true,
    });
  }
  const last = page[page.length - 1];
  return {
    rows,
    next:
      hits.length > PAGE_LIMIT && last ? encodeCursor({ v: last.sort_value, id: last.id }) : null,
  };
}

export interface PickerItem {
  id: string;
  variantId: string | null;
  label: string;
  sku: string | null;
  unit: string;
  unitPrice: string;
  taxRate: string;
  kind: 'product' | 'service' | 'bundle';
}

/** Active items that match the text (name, SKU, barcode), with the price that applies to the client (quantity 1). */
export async function pickProducts(
  companyId: string,
  q: string,
  clientId: string | null,
  limit: number,
): Promise<PickerItem[]> {
  const found = await searchProducts(companyId, {
    q: q || undefined,
    status: 'active',
    sort: 'name',
    desc: '0',
  });
  const admin = getAdminSupabase();
  const ids = found.rows.slice(0, limit).map((r) => r.id);
  if (ids.length === 0) return [];
  const [full, rates, variants] = await Promise.all([
    admin
      .from('products')
      .select('id, kind, name, sku, unit, unit_price, tax_rate, volume_tiers')
      .eq('company_id', companyId)
      .in('id', ids),
    clientId
      ? admin
          .from('client_prices')
          .select('product_id, unit_price')
          .eq('company_id', companyId)
          .eq('client_id', clientId)
          .in('product_id', ids)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as { product_id: string; unit_price: number }[], error: null }),
    admin
      .from('product_variants')
      .select('id, product_id, name, sku, unit_price')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('product_id', ids)
      .is('deleted_at', null),
  ]);
  if (full.error) throw new InternalError(full.error);
  const rate = new Map((rates.data ?? []).map((r) => [String(r.product_id), String(r.unit_price)]));
  const out: PickerItem[] = [];
  for (const id of ids) {
    const p = (full.data ?? []).find((x) => String(x.id) === id);
    if (!p) continue;
    const tiers = Array.isArray(p.volume_tiers)
      ? (p.volume_tiers as { minQty: string; unitPrice: string }[])
      : [];
    const base = Money.parseRounded(String(p.unit_price)).toDbString();
    const own = (variants.data ?? []).filter((v) => String(v.product_id) === id);
    const common = {
      unit: String(p.unit),
      taxRate: Money.parseRounded(String(p.tax_rate)).toDbString(),
      kind: String(p.kind) as PickerItem['kind'],
    };
    if (own.length === 0) {
      out.push({
        id,
        variantId: null,
        label: String(p.name),
        sku: p.sku ? String(p.sku) : null,
        ...common,
        unitPrice: resolveUnitPrice({
          base,
          tiers,
          clientPrice: rate.get(id) ?? null,
          quantity: '1',
        }).unitPrice,
      });
      continue;
    }
    for (const v of own) {
      out.push({
        id,
        variantId: String(v.id),
        label: `${String(p.name)} - ${String(v.name)}`,
        sku: v.sku ? String(v.sku) : p.sku ? String(p.sku) : null,
        ...common,
        unitPrice: resolveUnitPrice({
          base,
          variantPrice:
            v.unit_price === null ? null : Money.parseRounded(String(v.unit_price)).toDbString(),
          tiers,
          clientPrice: rate.get(id) ?? null,
          quantity: '1',
        }).unitPrice,
      });
    }
  }
  return out.slice(0, limit);
}
