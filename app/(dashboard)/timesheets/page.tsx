// path: app/(dashboard)/timesheets/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { TimeSettingsForm } from '@/components/project/time-settings-form';
import { TimeTracker } from '@/components/project/time-tracker';
import { TimesheetEntries, type EntryRow } from '@/components/project/timesheet-entries';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { addDays } from '@/lib/invoice/terms';
import { t } from '@/lib/i18n';
import { weekStart } from '@/lib/project/time';
import { requirePagePermission } from '@/services/base/page-guard';
import { listProjects } from '@/services/project/projects';
import { currentTimer, getTimeSettings, listEntries, timesheet } from '@/services/project/time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Timesheets' };

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('time.log', 'tenant', 'time_entry');
  const companyId = actor.companyId as string;
  const raw = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const day = raw.week && /^\d{4}-\d{2}-\d{2}$/.test(raw.week) ? raw.week : today;
  const [sheet, timer, projects, settings, queue, canSettings] = await Promise.all([
    timesheet(actor, day),
    currentTimer(actor),
    listProjects(companyId, { status: 'active', limit: 200 }),
    getTimeSettings(companyId),
    listEntries(actor, { status: 'submitted', limit: 200 }),
    getService('permissions').can(actor, 'time.settings', { type: 'time_settings' }),
  ]);
  const start = weekStart(day);
  const mine: EntryRow[] = sheet.entries.map((e) => ({ ...e, mine: true }));
  const approvals: EntryRow[] = queue
    .filter((e) => e.userId !== actor.userId || actor.role === 'owner')
    .map((e) => ({ ...e, mine: e.userId === actor.userId }));
  return (
    <div className="mx-auto max-w-5xl space-y-sp-24">
      <PageHeader
        title={t('s09Projects.time.title')}
        description={t('s09Projects.time.description')}
        actions={
          <Link className="underline" href="/projects">
            {t('s09Projects.title')}
          </Link>
        }
      />
      <TimeTracker
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          billable: p.billingType !== 'non_billable',
        }))}
        running={
          timer && timer.startedAt
            ? { projectName: timer.projectName, startedAt: timer.startedAt }
            : null
        }
        today={today}
      />
      <section className="space-y-sp-8">
        <div className="flex flex-wrap items-center justify-between gap-sp-8 text-sm">
          <h2 className="text-lg font-semibold">{t('s09Projects.time.weekOf', { date: start })}</h2>
          <nav className="flex gap-sp-12" aria-label={t('s09Projects.time.title')}>
            <Link className="underline" href={`/timesheets?week=${addDays(start, -7)}`}>
              {t('s09Projects.time.previous')}
            </Link>
            <Link className="underline" href="/timesheets">
              {t('s09Projects.time.thisWeek')}
            </Link>
            <Link className="underline" href={`/timesheets?week=${addDays(start, 7)}`}>
              {t('s09Projects.time.next')}
            </Link>
          </nav>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('s09Projects.time.weekOf', { date: start })}</caption>
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-sp-4">
                  {t('s09Projects.time.project')}
                </th>
                {sheet.days.map((d) => (
                  <th key={d} scope="col" className="text-right">
                    {d.slice(5)}
                  </th>
                ))}
                <th scope="col" className="text-right">
                  {t('s09Projects.time.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.projectId} className="border-b">
                  <td className="py-sp-4">{r.projectName}</td>
                  {r.hoursByDay.map((h, i) => (
                    <td key={i} className="text-right">
                      {h === '0.00' ? '' : h}
                    </td>
                  ))}
                  <td className="text-right font-medium">{r.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-sp-4">{t('s09Projects.time.total')}</td>
                {sheet.dayTotals.map((h, i) => (
                  <td key={i} className="text-right">
                    {h === '0.00' ? '' : h}
                  </td>
                ))}
                <td className="text-right">{sheet.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TimesheetEntries entries={mine} approvals={false} showAmounts={false} />
      </section>
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Projects.time.approvalsTitle')}</h2>
        <TimesheetEntries entries={approvals} approvals showAmounts />
      </section>
      {canSettings ? (
        <TimeSettingsForm
          initial={{
            requireApproval: settings.requireApproval,
            roundMinutes: settings.roundMinutes,
            lockThrough: settings.lockThrough,
          }}
          version={settings.version}
        />
      ) : null}
    </div>
  );
}
