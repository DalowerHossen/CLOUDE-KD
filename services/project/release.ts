// path: services/project/release.ts
// Gives billed time, milestones and expenses back when the invoice that took them is deleted or voided, and releases
// claims that never got an invoice. Kept small and free of the invoice code so the invoice service can call it.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { billableExpenseProvider } from './expense-hook';

export async function releaseBilledWork(companyId: string, invoiceId: string): Promise<void> {
  const admin = getAdminSupabase();
  const time = await admin.rpc('kd_time_release', {
    p_company: companyId,
    p_invoice: invoiceId,
    p_ids: null,
  });
  if (time.error) throw new InternalError(time.error);
  const ms = await admin
    .from('project_milestones')
    .update({ status: 'done', invoice_id: null })
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .eq('status', 'billed');
  if (ms.error) throw new InternalError(ms.error);
  const expenses = billableExpenseProvider();
  if (expenses) await expenses.release(companyId, invoiceId).catch(() => undefined);
}

/** Job: claims older than an hour that never got an invoice go back to "approved". */
export async function releaseStaleClaims(): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_time_release_stale');
  if (error) throw new InternalError(error);
  return toInt(data, 0);
}
