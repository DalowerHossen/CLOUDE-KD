// path: services/supplier/suppliers.ts
// Suppliers: create, change, archive, delete (while no order exists), and the searchable list.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { checkCustomValues } from '@/lib/crm/custom-values';
import { PAGE_LIMIT, decodeCursor, encodeCursor } from '@/lib/crm/search';
import type { SupplierInput, SupplierListQuery } from '@/lib/procurement/suppliers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { listDefs } from '@/services/client/custom-fields';

export interface SupplierView {
  id: string;
  name: string;
  contactName: string;
  email: string | null;
  phone: string;
  website: string;
  taxId: string;
  category: string;
  paymentTermsDays: number | null;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string | null;
  notes: string;
  customFields: Record<string, string | number | boolean | null>;
  status: 'active' | 'archived';
  version: number;
  createdAt: string;
}
export interface SupplierRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  category: string;
  status: 'active' | 'archived';
}

export const SUPPLIER_COLUMNS =
  'id, name, contact_name, email, phone, website, tax_id, category, payment_terms_days, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, notes, custom_fields, status, version, created_at';

type Row = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export function toSupplier(r: Row): SupplierView {
  return {
    id: String(r.id),
    name: text(r.name),
    contactName: text(r.contact_name),
    email: r.email ? String(r.email) : null,
    phone: text(r.phone),
    website: text(r.website),
    taxId: text(r.tax_id),
    category: text(r.category),
    paymentTermsDays:
      r.payment_terms_days === null || r.payment_terms_days === undefined
        ? null
        : Math.trunc(Number(r.payment_terms_days)),
    addressLine1: text(r.address_line1),
    addressLine2: text(r.address_line2),
    addressCity: text(r.address_city),
    addressRegion: text(r.address_region),
    addressPostalCode: text(r.address_postal_code),
    addressCountry: r.address_country ? String(r.address_country) : null,
    notes: text(r.notes),
    customFields: (r.custom_fields ?? {}) as SupplierView['customFields'],
    status: String(r.status) as SupplierView['status'],
    version: Math.trunc(Number(r.version)),
    createdAt: String(r.created_at),
  };
}

function columns(i: SupplierInput): Row {
  return {
    name: i.name,
    contact_name: i.contactName,
    email: i.email,
    phone: i.phone,
    website: i.website,
    tax_id: i.taxId,
    category: i.category,
    payment_terms_days: i.paymentTermsDays,
    address_line1: i.addressLine1,
    address_line2: i.addressLine2,
    address_city: i.addressCity,
    address_region: i.addressRegion,
    address_postal_code: i.addressPostalCode,
    address_country: i.addressCountry,
    notes: i.notes,
  };
}

function needCompany(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function getSupplier(companyId: string, id: string): Promise<SupplierView> {
  const { data, error } = await getAdminSupabase()
    .from('suppliers')
    .select(SUPPLIER_COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toSupplier(data as unknown as Row);
}

export async function createSupplier(actor: Actor, input: SupplierInput): Promise<SupplierView> {
  const companyId = needCompany(actor);
  const custom = checkCustomValues(await listDefs(companyId, 'supplier'), input.customFields);
  const { data, error } = await getAdminSupabase()
    .from('suppliers')
    .insert({
      company_id: companyId,
      created_by: actor.userId,
      custom_fields: custom,
      ...columns(input),
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'supplier.created',
    resourceType: 'supplier',
    resourceId: String(data.id),
    companyId,
    metadata: { by: actor.userId },
  });
  return getSupplier(companyId, String(data.id));
}

export async function updateSupplier(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: SupplierInput,
): Promise<SupplierView> {
  const companyId = needCompany(actor);
  await getSupplier(companyId, id);
  const custom = checkCustomValues(await listDefs(companyId, 'supplier'), input.customFields);
  const r = await getAdminSupabase()
    .from('suppliers')
    .update({ ...columns(input), custom_fields: custom })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await getService('audit').record({
    action: 'supplier.updated',
    resourceType: 'supplier',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getSupplier(companyId, id);
}

export async function setSupplierStatus(
  actor: Actor,
  id: string,
  action: 'archive' | 'reactivate',
): Promise<SupplierView> {
  const companyId = needCompany(actor);
  const r = await getAdminSupabase()
    .from('suppliers')
    .update({ status: action === 'archive' ? 'archived' : 'active' })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: `supplier.${action === 'archive' ? 'archived' : 'reactivated'}`,
    resourceType: 'supplier',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getSupplier(companyId, id);
}

export async function deleteSupplier(actor: Actor, id: string): Promise<void> {
  const companyId = needCompany(actor);
  await getSupplier(companyId, id);
  const admin = getAdminSupabase();
  const used = await admin
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id)
    .is('deleted_at', null);
  if ((used.count ?? 0) > 0)
    throw new ValidationError('This supplier has purchase orders. Archive the supplier instead.');
  const r = await admin
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'supplier.deleted',
    resourceType: 'supplier',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export async function searchSuppliers(
  companyId: string,
  query: SupplierListQuery,
): Promise<{ rows: SupplierRow[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  const found = await admin.rpc('kd_supplier_search', {
    p_company: companyId,
    p_q: query.q ?? null,
    p_status: query.status ?? null,
    p_category: query.category ?? null,
    p_after_value: cursor?.v ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: PAGE_LIMIT + 1,
  });
  if (found.error) throw new InternalError(found.error);
  const hits = (found.data ?? []) as { id: string; sort_value: string }[];
  const page = hits.slice(0, PAGE_LIMIT);
  if (page.length === 0) return { rows: [], next: null };
  const { data, error } = await admin
    .from('suppliers')
    .select('id, name, email, phone, category, status')
    .eq('company_id', companyId)
    .in(
      'id',
      page.map((h) => h.id),
    );
  if (error) throw new InternalError(error);
  const byId = new Map((data ?? []).map((r) => [String(r.id), r]));
  const rows: SupplierRow[] = [];
  for (const h of page) {
    const r = byId.get(h.id);
    if (r)
      rows.push({
        id: String(r.id),
        name: String(r.name),
        email: r.email ? String(r.email) : null,
        phone: String(r.phone),
        category: String(r.category),
        status: String(r.status) as SupplierRow['status'],
      });
  }
  const last = page[page.length - 1];
  return {
    rows,
    next:
      hits.length > PAGE_LIMIT && last ? encodeCursor({ v: last.sort_value, id: last.id }) : null,
  };
}

export async function supplierCategories(companyId: string): Promise<string[]> {
  const { data, error } = await getAdminSupabase()
    .from('suppliers')
    .select('category')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('category', '')
    .limit(1000);
  if (error) throw new InternalError(error);
  return [...new Set((data ?? []).map((r) => String(r.category)))].sort();
}
