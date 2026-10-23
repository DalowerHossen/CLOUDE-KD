// path: services/product/client-rates.ts
// Prices agreed with one client, and the lookup that tells which unit price applies to a client, product and
// quantity (client price, else volume tier, else variant price, else the product price).
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { resolveUnitPrice, type PriceSource } from '@/lib/catalog/resolve';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface ClientRate {
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  unitPrice: string;
}

export async function listRates(
  companyId: string,
  filter: { productId?: string; clientId?: string },
): Promise<ClientRate[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('client_prices')
    .select('client_id, product_id, unit_price')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(500);
  if (filter.productId) q = q.eq('product_id', filter.productId);
  if (filter.clientId) q = q.eq('client_id', filter.clientId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const clients = [...new Set((data ?? []).map((r) => String(r.client_id)))];
  const products = [...new Set((data ?? []).map((r) => String(r.product_id)))];
  const [c, p] = await Promise.all([
    clients.length
      ? admin.from('clients').select('id, name').in('id', clients)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    products.length
      ? admin.from('products').select('id, name').in('id', products)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const cn = new Map((c.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const pn = new Map((p.data ?? []).map((x) => [String(x.id), String(x.name)]));
  return (data ?? []).map((r) => ({
    clientId: String(r.client_id),
    clientName: cn.get(String(r.client_id)) ?? '',
    productId: String(r.product_id),
    productName: pn.get(String(r.product_id)) ?? '',
    unitPrice: Money.parseRounded(String(r.unit_price)).toDbString(),
  }));
}

/** Sets the price of a product for a client; null removes it. */
export async function setRate(
  actor: Actor,
  input: { clientId: string; productId: string; unitPrice: string | null },
): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const [c, p] = await Promise.all([
    admin
      .from('clients')
      .select('id')
      .eq('id', input.clientId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('products')
      .select('id')
      .eq('id', input.productId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);
  if (!c.data || !p.data) throw new NotFoundError();
  const existing = await admin
    .from('client_prices')
    .select('id')
    .eq('client_id', input.clientId)
    .eq('product_id', input.productId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  let r;
  if (input.unitPrice === null) {
    if (!existing.data) return;
    r = await admin
      .from('client_prices')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(existing.data.id))
      .eq('company_id', companyId);
  } else if (existing.data) {
    r = await admin
      .from('client_prices')
      .update({ unit_price: input.unitPrice })
      .eq('id', String(existing.data.id))
      .eq('company_id', companyId);
  } else {
    r = await admin.from('client_prices').insert({
      company_id: companyId,
      client_id: input.clientId,
      product_id: input.productId,
      unit_price: input.unitPrice,
    });
  }
  if (r.error) throw new InternalError(r.error);
  await getService('audit').record({
    action: input.unitPrice === null ? 'client_rate.removed' : 'client_rate.set',
    resourceType: 'product',
    resourceId: input.productId,
    companyId,
    metadata: { clientId: input.clientId, by: actor.userId },
  });
}

/** The unit price for a line: used by the invoice and estimate screens. */
export async function priceFor(
  companyId: string,
  input: {
    productId: string;
    variantId?: string | null;
    clientId?: string | null;
    quantity: string;
  },
): Promise<{ unitPrice: string; source: PriceSource; taxRate: string }> {
  const admin = getAdminSupabase();
  const p = await admin
    .from('products')
    .select('unit_price, tax_rate, volume_tiers')
    .eq('id', input.productId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (p.error) throw new InternalError(p.error);
  if (!p.data) throw new NotFoundError();
  let variantPrice: string | null = null;
  if (input.variantId) {
    const v = await admin
      .from('product_variants')
      .select('unit_price')
      .eq('id', input.variantId)
      .eq('product_id', input.productId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!v.data) throw new NotFoundError();
    variantPrice =
      v.data.unit_price === null
        ? null
        : Money.parseRounded(String(v.data.unit_price)).toDbString();
  }
  let clientPrice: string | null = null;
  if (input.clientId) {
    const c = await admin
      .from('client_prices')
      .select('unit_price')
      .eq('client_id', input.clientId)
      .eq('product_id', input.productId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    clientPrice = c.data ? Money.parseRounded(String(c.data.unit_price)).toDbString() : null;
  }
  const tiers = Array.isArray(p.data.volume_tiers)
    ? (p.data.volume_tiers as { minQty: string; unitPrice: string }[])
    : [];
  const resolved = resolveUnitPrice({
    base: Money.parseRounded(String(p.data.unit_price)).toDbString(),
    variantPrice,
    tiers,
    clientPrice,
    quantity: input.quantity,
  });
  return { ...resolved, taxRate: Money.parseRounded(String(p.data.tax_rate)).toDbString() };
}
