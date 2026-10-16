// path: services/inventory/warehouses.ts
// Warehouses: one default per company, a code that is unique, and no delete while stock or history exists.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  DuplicateError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import type { WarehouseInput } from '@/lib/stock/stock';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export interface WarehouseView {
  id: string;
  name: string;
  code: string;
  addressLine1: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string | null;
  isDefault: boolean;
  isActive: boolean;
  version: number;
}

const COLUMNS =
  'id, name, code, address_line1, address_city, address_region, address_postal_code, address_country, is_default, is_active, version';
const view = (r: Record<string, unknown>): WarehouseView => ({
  id: String(r.id),
  name: String(r.name),
  code: String(r.code),
  addressLine1: String(r.address_line1 ?? ''),
  addressCity: String(r.address_city ?? ''),
  addressRegion: String(r.address_region ?? ''),
  addressPostalCode: String(r.address_postal_code ?? ''),
  addressCountry: r.address_country ? String(r.address_country) : null,
  isDefault: r.is_default === true,
  isActive: r.is_active === true,
  version: Math.trunc(Number(r.version)),
});

export async function listWarehouses(companyId: string): Promise<WarehouseView[]> {
  const { data, error } = await getAdminSupabase()
    .from('warehouses')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw new InternalError(error);
  return (data ?? []).map(view);
}

/** The company's default warehouse; the first one is created when there is none. */
export async function ensureDefaultWarehouse(companyId: string): Promise<WarehouseView> {
  const all = await listWarehouses(companyId);
  const found = all.find((w) => w.isDefault);
  if (found) return found;
  const admin = getAdminSupabase();
  if (all.length > 0 && all[0]) {
    const r = await admin
      .from('warehouses')
      .update({ is_default: true, is_active: true })
      .eq('id', all[0].id)
      .eq('company_id', companyId)
      .select(COLUMNS)
      .single();
    if (r.error) throw new InternalError(r.error);
    return view(r.data);
  }
  const r = await admin
    .from('warehouses')
    .insert({ company_id: companyId, name: 'Main warehouse', code: 'MAIN', is_default: true })
    .select(COLUMNS)
    .single();
  if (r.error) {
    if (r.error.code === '23505') return ensureDefaultWarehouse(companyId);
    throw new InternalError(r.error);
  }
  return view(r.data);
}

export async function saveWarehouse(actor: Actor, input: WarehouseInput): Promise<WarehouseView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const row = {
    name: input.name,
    code: input.code,
    address_line1: input.addressLine1,
    address_city: input.addressCity,
    address_region: input.addressRegion,
    address_postal_code: input.addressPostalCode,
    address_country: input.addressCountry,
    is_active: input.isActive,
  };
  let saved: Record<string, unknown>;
  if (input.id) {
    if (!input.expectedVersion) throw new ValidationError('The loaded version is needed.');
    const current = (await listWarehouses(companyId)).find((w) => w.id === input.id);
    if (!current) throw new NotFoundError();
    if (current.isDefault && !input.isActive)
      throw new ValidationError(
        'The default warehouse cannot be switched off. Make another one the default first.',
      );
    const r = await admin
      .from('warehouses')
      .update(row)
      .eq('id', input.id)
      .eq('company_id', companyId)
      .eq('version', input.expectedVersion)
      .is('deleted_at', null)
      .select(COLUMNS);
    if (r.error) {
      if (r.error.code === '23505')
        throw new DuplicateError('Another warehouse already uses this code.');
      throw new InternalError(r.error);
    }
    if (!r.data || r.data.length === 0) throw new ConflictError();
    saved = r.data[0] as Record<string, unknown>;
  } else {
    const existing = await listWarehouses(companyId);
    const r = await admin
      .from('warehouses')
      .insert({ company_id: companyId, ...row, is_default: existing.length === 0 })
      .select(COLUMNS)
      .single();
    if (r.error) {
      if (r.error.code === '23505')
        throw new DuplicateError('Another warehouse already uses this code.');
      throw new InternalError(r.error);
    }
    saved = r.data;
  }
  await getService('audit').record({
    action: input.id ? 'warehouse.updated' : 'warehouse.created',
    resourceType: 'warehouse',
    resourceId: String(saved.id),
    companyId,
    metadata: { by: actor.userId },
  });
  return view(saved);
}

export async function makeDefault(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const target = (await listWarehouses(companyId)).find((w) => w.id === id);
  if (!target) throw new NotFoundError();
  if (!target.isActive) throw new ValidationError('Switch the warehouse on first.');
  if (target.isDefault) return;
  // The unique index allows one default, so the old one is cleared first.
  const clear = await admin
    .from('warehouses')
    .update({ is_default: false })
    .eq('company_id', companyId)
    .eq('is_default', true)
    .is('deleted_at', null);
  if (clear.error) throw new InternalError(clear.error);
  const set = await admin
    .from('warehouses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('company_id', companyId);
  if (set.error) throw new InternalError(set.error);
  await getService('audit').record({
    action: 'warehouse.made_default',
    resourceType: 'warehouse',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

export async function deleteWarehouse(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const target = (await listWarehouses(companyId)).find((w) => w.id === id);
  if (!target) throw new NotFoundError();
  if (target.isDefault) throw new ValidationError('The default warehouse cannot be deleted.');
  const used = await admin
    .from('stock_movements')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('warehouse_id', id);
  if ((used.count ?? 0) > 0)
    throw new ValidationError(
      'This warehouse has stock history. Switch it off instead of deleting it.',
    );
  const r = await admin
    .from('warehouses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'warehouse.deleted',
    resourceType: 'warehouse',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}
