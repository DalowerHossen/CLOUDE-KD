// path: services/import/targets/suppliers.ts
// Suppliers as an import and export target. A duplicate is a supplier with the same e-mail, else the same name.
import 'server-only';
import { supplierInputSchema, type SupplierInput } from '@/lib/procurement/suppliers';
import { deepMerge } from '@/lib/transfer/rows';
import { SUPPLIER_FIELDS, parseSupplierRow, type ParsedSupplier } from '@/lib/transfer/targets';
import type { ImportTarget } from '@/lib/transfer/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { InternalError } from '@/lib/errors';
import {
  SUPPLIER_COLUMNS,
  createSupplier,
  getSupplier,
  toSupplier,
  updateSupplier,
  type SupplierView,
} from '@/services/supplier/suppliers';
import { EXPORT_LIMIT, filterText, likeExact } from './shared';

function viewToInput(s: SupplierView): SupplierInput {
  return supplierInputSchema.parse({
    name: s.name,
    contactName: s.contactName,
    email: s.email ?? '',
    phone: s.phone,
    website: s.website,
    taxId: s.taxId,
    category: s.category,
    paymentTermsDays: s.paymentTermsDays,
    addressLine1: s.addressLine1,
    addressLine2: s.addressLine2,
    addressCity: s.addressCity,
    addressRegion: s.addressRegion,
    addressPostalCode: s.addressPostalCode,
    addressCountry: s.addressCountry,
    notes: s.notes,
    customFields: s.customFields,
  });
}

async function firstId(
  companyId: string,
  column: string,
  value: string,
  exact: boolean,
): Promise<string | null> {
  let q = getAdminSupabase()
    .from('suppliers')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(1);
  q = exact ? q.eq(column, value) : q.ilike(column, likeExact(value));
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return data?.[0] ? String(data[0].id) : null;
}

export const suppliersTarget: ImportTarget<ParsedSupplier> = {
  id: 'suppliers',
  writePermission: 'supplier.write',
  readPermission: 'supplier.read',
  resourceType: 'supplier',
  fields: SUPPLIER_FIELDS,
  parse: (row) => parseSupplierRow(row),
  fileKey: (v) => (v.input.email ? `e:${v.input.email}` : `n:${v.input.name.toLowerCase()}`),
  async findDuplicate(companyId, v) {
    if (v.input.email) {
      const hit = await firstId(companyId, 'email', v.input.email, true);
      if (hit) return hit;
    }
    return firstId(companyId, 'name', v.input.name, false);
  },
  async create(actor, v) {
    return (await createSupplier(actor, v.input)).id;
  },
  async update(actor, id, v) {
    if (!actor.companyId) return;
    const current = await getSupplier(actor.companyId, id);
    const merged = supplierInputSchema.parse(
      deepMerge(viewToInput(current) as unknown as Record<string, unknown>, v.patch),
    );
    await updateSupplier(actor, id, current.version, merged);
  },
  exportColumns: [
    ...SUPPLIER_FIELDS.map((f) => ({ key: f.key, label: f.label })),
    { key: 'status', label: 'State' },
  ],
  async exportRows(companyId, filter) {
    let q = getAdminSupabase()
      .from('suppliers')
      .select(SUPPLIER_COLUMNS)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name')
      .limit(EXPORT_LIMIT);
    if (filter.status === 'active' || filter.status === 'archived')
      q = q.eq('status', filter.status);
    const text = filterText(filter.q ?? '');
    if (text) q = q.or(`name.ilike.%${text}%,email.ilike.%${text}%,tax_id.ilike.%${text}%`);
    const { data, error } = await q;
    if (error) throw new InternalError(error);
    return (data ?? []).map((r) => {
      const s = toSupplier(r as unknown as Record<string, unknown>);
      return {
        name: s.name,
        contact_name: s.contactName,
        email: s.email ?? '',
        phone: s.phone,
        website: s.website,
        tax_id: s.taxId,
        category: s.category,
        payment_terms_days: s.paymentTermsDays === null ? '' : String(s.paymentTermsDays),
        address_line1: s.addressLine1,
        address_line2: s.addressLine2,
        address_city: s.addressCity,
        address_region: s.addressRegion,
        address_postal_code: s.addressPostalCode,
        address_country: s.addressCountry ?? '',
        notes: s.notes,
        status: s.status,
      };
    });
  },
};
