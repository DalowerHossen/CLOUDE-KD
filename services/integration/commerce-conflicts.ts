// path: services/integration/commerce-conflicts.ts
// Mismatches between a store order and the platform that need a person: another currency, a SKU that is not mapped, no e-mail, no
// billing address, a refund made in the store. A person resolves it (the problem was fixed) or ignores it (the order may go on
// without it); when the last open conflict of an order is closed, the order is handled again.
import 'server-only';
import { CONFLICT_KINDS, type ConflictKind } from '@/config/s16-commerce';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { conflictResolution } from '@/lib/integrations/mapping-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { need, record, writeLog } from './commerce-db';
import { processOrder } from './commerce-orders';

const COLUMNS =
  'id, integration_id, order_id, kind, detail, status, resolution, resolved_at, created_at, version, integration_orders(external_number, external_id)';

interface Row {
  id: string;
  integration_id: string;
  order_id: string;
  kind: string;
  detail: string;
  status: string;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  version: number;
  integration_orders:
    | { external_number: string | null; external_id: string }
    | { external_number: string | null; external_id: string }[]
    | null;
}

export interface ConflictView {
  id: string;
  integrationId: string;
  orderId: string;
  orderLabel: string;
  kind: ConflictKind;
  detail: string;
  status: 'open' | 'resolved' | 'ignored';
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  version: number;
}

const toView = (r: Row): ConflictView => {
  const o = Array.isArray(r.integration_orders) ? r.integration_orders[0] : r.integration_orders;
  return {
    id: r.id,
    integrationId: r.integration_id,
    orderId: r.order_id,
    orderLabel: o?.external_number ?? o?.external_id ?? '',
    kind: CONFLICT_KINDS.find((k) => k === r.kind) ?? 'refund',
    detail: r.detail,
    status: r.status === 'resolved' ? 'resolved' : r.status === 'ignored' ? 'ignored' : 'open',
    resolution: r.resolution,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    version: r.version,
  };
};

export async function listConflicts(
  companyId: string,
  filter: { status?: string; integrationId?: string; limit?: number } = {},
): Promise<ConflictView[]> {
  let q = getAdminSupabase()
    .from('integration_conflicts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 100, 200));
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.integrationId) q = q.eq('integration_id', filter.integrationId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

export async function resolveConflict(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ConflictView> {
  const companyId = need(actor);
  const parsed = conflictResolution.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The answer is not valid.');
  const admin = getAdminSupabase();
  const found = await admin
    .from('integration_conflicts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  const row = found.data as unknown as Row;
  if (row.status !== 'open') throw new ConflictError('This conflict is already closed.');
  const { error } = await admin
    .from('integration_conflicts')
    .update({
      status: parsed.data.resolution,
      resolution: parsed.data.note === '' ? null : parsed.data.note,
      resolved_by: actor.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'open');
  if (error) mapIntegrationError(error);
  await record(companyId, 'commerce.conflict_closed', 'integration_conflict', id, {
    kind: row.kind,
    resolution: parsed.data.resolution,
  });
  await writeLog(
    companyId,
    row.integration_id,
    row.order_id,
    'conflict',
    'info',
    `Conflict ${parsed.data.resolution}: ${row.kind}.`,
  );
  // The order goes on when nothing else stops it.
  const left = await admin
    .from('integration_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('order_id', row.order_id)
    .eq('status', 'open')
    .neq('kind', 'refund');
  if (left.error) throw new InternalError(left.error);
  if ((left.count ?? 0) === 0) {
    const moved = await admin
      .from('integration_orders')
      .update({ status: 'received', attempts: 0, last_error: null })
      .eq('company_id', companyId)
      .eq('id', row.order_id)
      .eq('status', 'conflict');
    if (moved.error) mapIntegrationError(moved.error);
    await processOrder(companyId, row.order_id);
  }
  const after = await admin
    .from('integration_conflicts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .single();
  if (after.error) throw new InternalError(after.error);
  return toView(after.data as unknown as Row);
}
