// path: services/bnpl/reports.ts
// The installment report of a company, or of the whole platform: plans taken, the volume, the fees the sellers pay, and
// how many plans ended in default.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';

export interface BnplReport {
  from: string;
  to: string;
  plans: number;
  active: number;
  completed: number;
  defaulted: number;
  cancelled: number;
  volume: string;
  fees: string;
  defaultRate: string | null;
}

export async function bnplReport(
  companyId: string | null,
  from: string,
  to: string,
): Promise<BnplReport> {
  let q = getAdminSupabase()
    .from('bnpl_plans')
    .select('status, principal, seller_fee')
    .is('deleted_at', null)
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lt('created_at', `${to}T00:00:00.000Z`)
    .limit(50_000);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const count = (s: string): number => rows.filter((r) => r.status === s).length;
  const live = rows.filter((r) => r.status !== 'cancelled');
  const volume = live.reduce((sum, r) => sum.add(String(r.principal)), Money.zero());
  const fees = live.reduce((sum, r) => sum.add(String(r.seller_fee)), Money.zero());
  const ended = count('completed') + count('defaulted');
  return {
    from,
    to,
    plans: live.length,
    active: count('active'),
    completed: count('completed'),
    defaulted: count('defaulted'),
    cancelled: count('cancelled'),
    volume: volume.toDbString(),
    fees: fees.toDbString(),
    defaultRate: ended > 0 ? ((count('defaulted') * 100) / ended).toFixed(2) : null,
  };
}
