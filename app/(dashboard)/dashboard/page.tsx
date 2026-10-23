// path: app/(dashboard)/dashboard/page.tsx
import type { Metadata } from 'next';
import { DashboardBoard } from '@/components/charts/dashboard-board';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { WIDGET_IDS, type WidgetId } from '@/lib/reports/widgets';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getDashboard,
  getLayout,
  parseRange,
  type DashboardData,
} from '@/services/report/dashboard';
import { listEntries, timesheet } from '@/services/project/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'invoice');
  const companyId = actor.companyId as string;
  const range = parseRange((await searchParams).range);
  const today = new Date().toISOString().slice(0, 10);
  const perms = getService('permissions');
  const can = (action: string, type: string): Promise<boolean> =>
    perms.can(actor, action, { type });
  const [invoice, estimate, project, time, client, bill] = await Promise.all([
    can('invoice.create', 'invoice'),
    can('estimate.create', 'estimate'),
    can('project.manage', 'project'),
    can('time.log', 'time_entry'),
    can('client.create', 'client'),
    can('project.bill', 'project'),
  ]);
  const allowed = new Set<WidgetId>(WIDGET_IDS.filter((id) => id !== 'time' || time));
  let data: DashboardData | null;
  try {
    data = await getDashboard(companyId, range, today);
  } catch {
    data = null;
  }
  const layout = await getLayout(actor, allowed);
  let hoursThisWeek = '0.00';
  let waiting = 0;
  if (time) {
    const sheet = await timesheet(actor, today).catch(() => null);
    hoursThisWeek = sheet?.total ?? '0.00';
    waiting = (
      await listEntries(actor, { status: 'submitted', limit: 200 }).catch(() => [])
    ).filter((e) => e.userId !== actor.userId || actor.role === 'owner').length;
  }
  return (
    <div className="mx-auto max-w-6xl space-y-sp-16">
      <PageHeader title={t('s09Dashboard.title')} description={t('s09Dashboard.description')} />
      {data === null ? (
        <ErrorState description={t('s09Dashboard.error')} />
      ) : (
        <DashboardBoard
          data={data}
          widgets={layout}
          quick={{ invoice, estimate, project, time, client, bill }}
          time={{ hoursThisWeek, waiting }}
        />
      )}
    </div>
  );
}
