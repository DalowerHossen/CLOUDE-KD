// path: services/integration/commerce-log.ts
// The sync log of a store: one line for each thing that happened (newest first). Lines are never changed.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface LogView {
  id: string;
  integrationId: string;
  orderId: string | null;
  event: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  createdAt: string;
}

interface Row {
  id: string;
  integration_id: string;
  order_id: string | null;
  event: string;
  level: string;
  message: string;
  created_at: string;
}

export async function listLog(
  companyId: string,
  filter: { integrationId?: string; orderId?: string; level?: string; limit?: number } = {},
): Promise<LogView[]> {
  let q = getAdminSupabase()
    .from('integration_sync_log')
    .select('id, integration_id, order_id, event, level, message, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 100, 300));
  if (filter.integrationId) q = q.eq('integration_id', filter.integrationId);
  if (filter.orderId) q = q.eq('order_id', filter.orderId);
  if (filter.level) q = q.eq('level', filter.level);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    integrationId: r.integration_id,
    orderId: r.order_id,
    event: r.event,
    level: r.level === 'error' ? 'error' : r.level === 'warn' ? 'warn' : 'info',
    message: r.message,
    createdAt: r.created_at,
  }));
}

/** The numbers of the status page: orders by state, open conflicts and the last errors, for one store or all stores. */
export async function syncStatus(
  companyId: string,
  integrationId?: string,
): Promise<{ orders: Record<string, number>; openConflicts: number; failedOrders: number }> {
  const admin = getAdminSupabase();
  const orders: Record<string, number> = {};
  let q = admin
    .from('integration_orders')
    .select('status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(5000);
  if (integrationId) q = q.eq('integration_id', integrationId);
  const o = await q;
  if (o.error) throw new InternalError(o.error);
  for (const r of (o.data ?? []) as { status: string }[])
    orders[r.status] = (orders[r.status] ?? 0) + 1;
  let c = admin
    .from('integration_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'open');
  if (integrationId) c = c.eq('integration_id', integrationId);
  const conflicts = await c;
  if (conflicts.error) throw new InternalError(conflicts.error);
  return { orders, openConflicts: conflicts.count ?? 0, failedOrders: orders.failed ?? 0 };
}
