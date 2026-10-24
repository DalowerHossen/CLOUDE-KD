// path: services/gateway/calls.ts
// The recent calls of the gateway for the owner's page (no bodies, no query values are stored).
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface CallView {
  id: string;
  subMerchantId: string | null;
  method: string;
  pathTemplate: string;
  statusCode: number | null;
  outcome: string;
  durationMs: number;
  createdAt: string;
}

export async function listCalls(
  companyId: string,
  subMerchantId: string | null,
  limit = 50,
): Promise<CallView[]> {
  let query = getAdminSupabase()
    .from('gateway_calls')
    .select(
      'id, sub_merchant_id, method, path_template, status_code, outcome, duration_ms, created_at',
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (subMerchantId !== null) query = query.eq('sub_merchant_id', subMerchantId);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    subMerchantId: r.sub_merchant_id ? String(r.sub_merchant_id) : null,
    method: String(r.method),
    pathTemplate: String(r.path_template),
    statusCode: r.status_code === null ? null : Number(r.status_code),
    outcome: String(r.outcome),
    durationMs: Number(r.duration_ms),
    createdAt: String(r.created_at),
  }));
}
