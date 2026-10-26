// path: services/company/admin-metrics.ts
// The money and health figures of the admin home: recurring revenue (MRR, ARR), paid revenue this month and since the start
// of the year, invoices issued this month, payment volume this month and the platform health score. Each figure is read on
// its own; one that cannot be read is null so the page shows "not available" for it and nothing else.
import 'server-only';
import { Money } from '@/lib/utils/currency';
import { healthScore, type HealthScore } from '@/lib/admin/health-score';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { healthReport } from '@/services/alerting/health';
import { revenueReport } from '@/services/subscription/analytics';

const log = createLogger({ component: 'admin-metrics' });

export interface HomeMetrics {
  mrr: string | null;
  arr: string | null;
  revenueMonth: string | null;
  revenueYtd: string | null;
  invoicesMonth: number | null;
  paymentVolumeMonth: string | null;
  health: HealthScore | null;
}

async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    log.warn('admin metric could not be read', { metric: name, error });
    return null;
  }
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

export async function homeMetrics(now: Date = new Date()): Promise<HomeMetrics> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const admin = getAdminSupabase();
  const [month, ytd, invoices, volume, health] = await Promise.all([
    safe('revenue month', () => revenueReport(day(monthStart), day(tomorrow))),
    safe('revenue ytd', () => revenueReport(day(yearStart), day(tomorrow))),
    safe('invoices', async () => {
      const { count, error } = await admin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gte('issue_date', day(monthStart));
      if (error) throw error;
      return count ?? 0;
    }),
    safe('payment volume', async () => {
      const { data, error } = await admin
        .from('payments')
        .select('captured_amount')
        .is('deleted_at', null)
        .gt('captured_amount', 0)
        .gte('captured_at', monthStart.toISOString())
        .limit(50_000);
      if (error) throw error;
      return Money.sum(
        (data ?? []).map((r) => Money.parse(String(r.captured_amount))),
      ).toDbString();
    }),
    safe('health', async () => {
      const r = await healthReport();
      return healthScore({
        databaseOk: r.database.ok,
        alertsCritical: r.alertsOpen.critical,
        alertsHigh: r.alertsOpen.high,
        incidentsOpen: r.incidentsOpen,
        siemFailing: r.siemFailing,
      });
    }),
  ]);
  return {
    mrr: month?.mrr ?? null,
    arr: month?.arr ?? null,
    revenueMonth: month?.paidRevenue ?? null,
    revenueYtd: ytd?.paidRevenue ?? null,
    invoicesMonth: invoices,
    paymentVolumeMonth: volume,
    health,
  };
}
