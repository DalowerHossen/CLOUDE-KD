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
  version: number;
  doc: SandboxDoc;
}

const COLUMNS = 'id, created_at, version, doc';

const toRecord = (r: {
  id: unknown;
  created_at: unknown;
  version: unknown;
  doc: unknown;
}): SandboxRecord => ({
  id: String(r.id),
  createdAt: String(r.created_at),
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

/** Adds the demo set when the company has no sandbox record yet. */
export async function seedSandbox(companyId: string): Promise<void> {
  const { count, error } = await getAdminSupabase()
    .from('api_sandbox_records')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  if ((count ?? 0) > 0) return;
  const ada = await insertOne(companyId, 'clients', {
    name: 'Ada Example',
    email: 'ada@example.test',
    country: 'US',
  });
  const bo = await insertOne(companyId, 'clients', {
    name: 'Bo Sample',
    email: 'bo@example.test',
    country: 'GB',
  });
  await insertOne(companyId, 'products', {
    name: 'Consulting hour',
    sku: 'CONS-1',
    price: '100.0000',
  });
  await insertOne(companyId, 'products', { name: 'Support plan', sku: 'SUP-1', price: '49.0000' });
  const inv1 = await insertOne(companyId, 'invoices', {
    number: 'SBX-0001',
    clientId: ada.id,
    status: 'sent',
    currency: 'USD',
    total: '250.0000',
    amountDue: '250.0000',
    issueDate: '2026-01-05',
    dueDate: '2026-02-04',
  });
  await insertOne(companyId, 'invoices', {
    number: 'SBX-0002',
    clientId: bo.id,
    status: 'paid',
    currency: 'USD',
    total: '49.0000',
    amountDue: '0.0000',
    issueDate: '2026-01-10',
    dueDate: '2026-02-09',
  });
  await insertOne(companyId, 'estimates', {
    number: 'SBX-E-0001',
    clientId: ada.id,
    status: 'sent',
    currency: 'USD',
    total: '900.0000',
  });
  await insertOne(companyId, 'payments', {
    invoiceId: inv1.id,
    amount: '50.0000',
    currency: 'USD',
    status: 'captured',
    method: 'sandbox',
  });
}

export async function listSandbox(
  companyId: string,
  resource: SandboxResource,
  page: { limit: number; afterId: string | null },
): Promise<SandboxRecord[]> {
  let q = getAdminSupabase()
    .from('api_sandbox_records')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('resource', resource)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(page.limit);
  if (page.afterId) q = q.gt('id', page.afterId);
  const { data, error } = await q;
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
