// path: app/(dashboard)/reports/[key]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReportViewer } from '@/components/reports/report-viewer';
import { SchedulePanel } from '@/components/reports/schedule-panel';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { paramsFromQuery, reportQuerySchema } from '@/lib/reports/params';
import { RANGE_KEYS } from '@/lib/reports/ranges';
import { requirePagePermission } from '@/services/base/page-guard';
import { runReport, type ReportRun } from '@/services/report/reports';
import { listPresets, listSchedules } from '@/services/report/schedules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report' };

const KEY = /^[a-z][a-z0-9_]{1,40}$/;

function queryOf(params: {
  range?: string;
  from?: string;
  to?: string;
  groupBy?: string;
  compare?: boolean;
}): string {
  const q = new URLSearchParams();
  if (params.from && params.to) {
    q.set('from', params.from);
    q.set('to', params.to);
  } else if (params.range) q.set('range', params.range);
  if (params.groupBy) q.set('groupBy', params.groupBy);
  if (params.compare) q.set('compare', 'true');
  return q.toString();
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('report.read', 'tenant', 'report');
  const { key } = await params;
  if (!KEY.test(key)) notFound();
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = reportQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : {};
  let run: ReportRun | null = null;
  try {
    run = await runReport(actor, key, paramsFromQuery(query));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    run = null;
  }
  const perms = getService('permissions');
  const [canExport, canSchedule, presets, schedules] = await Promise.all([
    perms.can(actor, 'report.export', { type: 'report' }),
    perms.can(actor, 'report.schedule', { type: 'report_schedule' }),
    listPresets(actor, key),
    listSchedules(actor.companyId as string),
  ]);
  const range =
    query.from && query.to ? 'custom' : (RANGE_KEYS.find((k) => k === query.range) ?? 'month');
  return (
    <div className="mx-auto max-w-5xl space-y-sp-16">
      <PageHeader
        title={run?.definition.title ?? t('s09Reports.title')}
        description={run?.definition.description}
        actions={
          <Link className="underline print:hidden" href="/reports">
            {t('s09Reports.back')}
          </Link>
        }
      />
      {run === null ? (
        <ErrorState description={t('s09Reports.result.error')} />
      ) : (
        <>
          <ReportViewer
            reportKey={key}
            usesPeriod={run.definition.usesPeriod}
            groupable={run.definition.groupable}
            canExport={canExport}
            canSchedule={canSchedule}
            initial={{
              range,
              from: run.params.from,
              to: run.params.to,
              groupBy: run.params.groupBy,
              compare: run.params.compare,
            }}
            result={run.result}
            previous={run.comparison?.previous ?? null}
            comparison={run.comparison?.rows ?? []}
            presets={presets.map((p) => ({ id: p.id, name: p.name, query: queryOf(p.params) }))}
          />
          {canSchedule ? (
            <SchedulePanel
              reportKey={key}
              groupable={run.definition.groupable}
              schedules={schedules
                .filter((s) => s.reportKey === key)
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  reportKey: s.reportKey,
                  frequency: s.frequency,
                  format: s.format,
                  enabled: s.enabled,
                  nextRunOn: s.nextRunOn,
                  lastRunOn: s.lastRunOn,
                  lastError: s.lastError,
                  recipients: s.recipients,
                }))}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
