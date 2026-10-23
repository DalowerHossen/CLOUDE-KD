// path: services/publicapi/sandbox.ts
// The data a sandbox key sees. It lives in its own table (`api_sandbox_records`) and is never read from or written to the live
// tables, so a test cannot touch real clients or invoices. The first sandbox key of a company seeds a small demo set.
import 'server-only';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export type SandboxResource = 'clients' | 'products' | 'invoices' | 'estimates' | 'payments';
export type SandboxDoc = Record<string, unknown>;

export interface SandboxRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  doc: SandboxDoc;
}

const COLUMNS = 'id, created_at, updated_at, version, doc';

const toRecord = (r: {
  id: unknown;
  created_at: unknown;
  updated_at: unknown;
  version: unknown;
  doc: unknown;
}): SandboxRecord => ({
  id: String(r.id),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  version: Number(r.version),
  doc: (r.doc ?? {}) as SandboxDoc,
});

async function insertOne(
  companyId: string,
  resource: SandboxResource,
  doc: SandboxDoc,
): Promise<SandboxRecord> {
  const { data, error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .insert({ company_id: companyId, resource, doc })
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  return toRecord(data as never);
}

const ADDRESS = { line1: '', line2: '', city: '', region: '', postal_code: '', country: null };

const demoClient = (name: string, email: string, country: string): SandboxDoc => ({
  kind: 'company',
  name,
  contact_name: '',
  email,
  phone: '',
  website: '',
  tax_id: '',
  currency: 'USD',
  payment_terms_days: 30,
  tags: [],
  status: 'active',
  billing_address: { ...ADDRESS, country },
});

const demoProduct = (name: string, sku: string, price: string): SandboxDoc => ({
  kind: 'service',
  name,
  description: '',
  sku,
  barcode: null,
  unit: 'unit',
  unit_price: price,
  tax_category: 'standard',
  tax_rate: '0',
  status: 'active',
});

/** Adds the demo set when the company has no sandbox record yet. */
export async function seedSandbox(companyId: string): Promise<void> {
  const { count, error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  if ((count ?? 0) > 0) return;
  const ada = await insertOne(
    companyId,
    'clients',
    demoClient('Ada Example', 'ada@example.test', 'US'),
  );
  const bo = await insertOne(
    companyId,
    'clients',
    demoClient('Bo Sample', 'bo@example.test', 'GB'),
  );
  await insertOne(companyId, 'products', demoProduct('Consulting hour', 'CONS-1', '100.0000'));
  await insertOne(companyId, 'products', demoProduct('Support plan', 'SUP-1', '49.0000'));
  const line = (description: string, price: string): SandboxDoc => ({
    position: 1,
    sku: '',
    description,
    quantity: '1.0000',
    unit: 'unit',
    unit_price: price,
    tax: '0.0000',
    line_total: price,
  });
  const inv1 = await insertOne(companyId, 'invoices', {
    number: 'SBX-0001',
    kind: 'invoice',
    status: 'sent',
    client_id: ada.id,
    issue_date: '2026-01-05',
    due_date: '2026-02-04',
    currency: 'USD',
    subtotal: '250.0000',
    tax_total: '0.0000',
    total: '250.0000',
    amount_paid: '50.0000',
    amount_due: '200.0000',
    sent_at: '2026-01-05T09:00:00.000Z',
    paid_at: null,
    items: [line('Consulting', '250.0000')],
  });
  await insertOne(companyId, 'invoices', {
    number: 'SBX-0002',
    kind: 'invoice',
    status: 'paid',
    client_id: bo.id,
    issue_date: '2026-01-10',
    due_date: '2026-02-09',
    currency: 'USD',
    subtotal: '49.0000',
    tax_total: '0.0000',
    total: '49.0000',
    amount_paid: '49.0000',
    amount_due: '0.0000',
    sent_at: '2026-01-10T09:00:00.000Z',
    paid_at: '2026-01-12T09:00:00.000Z',
    items: [line('Support plan', '49.0000')],
  });
  await insertOne(companyId, 'estimates', {
    number: 'SBX-E-0001',
    status: 'sent',
    client_id: ada.id,
    currency: 'USD',
    subtotal: '900.0000',
    tax_total: '0.0000',
    total: '900.0000',
    valid_until: '2026-03-01',
    sent_at: '2026-01-15T09:00:00.000Z',
  });
  await insertOne(companyId, 'payments', {
    invoice_id: inv1.id,
    client_id: ada.id,
    status: 'captured',
    amount: '50.0000',
    currency: 'USD',
    captured_amount: '50.0000',
    refunded_amount: '0.0000',
    payment_method: 'sandbox',
    captured_at: '2026-01-06T09:00:00.000Z',
  });
}

/** Every live sandbox record of one resource (the sandbox set is small; filtering and paging happen in memory). */
export async function allSandbox(
  companyId: string,
  resource: SandboxResource,
): Promise<SandboxRecord[]> {
  const { data, error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('resource', resource)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(2000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toRecord(r as never));
}

export async function getSandbox(
  companyId: string,
  resource: SandboxResource,
  id: string,
): Promise<SandboxRecord> {
  const { data, error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('resource', resource)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toRecord(data as never);
}

export async function createSandbox(
  companyId: string,
  resource: SandboxResource,
  doc: SandboxDoc,
): Promise<SandboxRecord> {
  if (Object.keys(doc).length === 0) throw new ValidationError('The record is empty.');
  return insertOne(companyId, resource, doc);
}

export async function updateSandbox(
  companyId: string,
  resource: SandboxResource,
  id: string,
  patch: SandboxDoc,
): Promise<SandboxRecord> {
  const current = await getSandbox(companyId, resource, id);
  const { data, error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .update({ doc: { ...current.doc, ...patch } })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', current.version)
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  return toRecord(data as never);
}

/** Removes every sandbox record of the company and seeds the demo set again. */
export async function resetSandbox(companyId: string): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  await seedSandbox(companyId);
}
