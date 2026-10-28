// path: services/integration/admin-stores.ts
// Platform staff view of the online stores (Shopify, WooCommerce) of every company: see them, connect a store for a company,
// check it and register its webhooks at the store. The work is the company's own connection service, called for the
// chosen company; every step is audit logged by that service.
import 'server-only';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import {
  checkConnection,
  connectStore,
  listConnections,
  registerWebhooks,
  type ConnectionView,
} from './connections';

export interface AdminStoreView extends ConnectionView {
  companyId: string;
  companyName: string;
}

async function actingFor(actor: Actor, companyId: string): Promise<Actor> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  const { data, error } = await getAdminSupabase()
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return { ...actor, companyId };
}

export async function listAllStores(): Promise<AdminStoreView[]> {
  const db = getAdminSupabase();
  const found = await db
    .from('integrations')
    .select('company_id')
    .in('provider', ['shopify', 'woocommerce'])
    .is('deleted_at', null)
    .limit(1000);
  if (found.error) throw new InternalError(found.error);
  const ids = [...new Set((found.data ?? []).map((r) => String(r.company_id)))].slice(0, 200);
  if (ids.length === 0) return [];
  const names = new Map<string, string>();
  const companies = await db.from('companies').select('id, name').in('id', ids);
  if (companies.error) throw new InternalError(companies.error);
  for (const c of companies.data ?? []) names.set(String(c.id), String(c.name));
  const out: AdminStoreView[] = [];
  for (const companyId of ids)
    for (const s of await listConnections(companyId))
      out.push({ ...s, companyId, companyName: names.get(companyId) ?? '' });
  return out;
}

export async function connectStoreFor(
  actor: Actor,
  companyId: string,
  input: unknown,
): Promise<ConnectionView> {
  return connectStore(await actingFor(actor, companyId), input);
}

export async function checkStoreFor(
  actor: Actor,
  companyId: string,
  id: string,
): ReturnType<typeof checkConnection> {
  return checkConnection(await actingFor(actor, companyId), id);
}

export async function registerStoreWebhooksFor(
  actor: Actor,
  companyId: string,
  id: string,
): ReturnType<typeof registerWebhooks> {
  return registerWebhooks(await actingFor(actor, companyId), id);
}
