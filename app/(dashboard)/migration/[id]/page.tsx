// path: app/(dashboard)/migration/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JobButton, MappingForm } from '@/components/migration/migration-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { hoursLeft, rollbackOpen } from '@/lib/migration/rules';
import { requirePagePermission } from '@/services/base/page-guard';
import { getJob, listRows, type JobDetail, type RowView } from '@/services/migration/jobs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import from another tool' };

export default async function MigrationJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('migration.read', 'tenant', 'migration_job');
  const { id } = await params;
  const canManage = await getService('permissions').can(actor, 'migration.manage', {
    type: 'migration_job',
  });
  let job: JobDetail | null;
  let rows: RowView[] = [];
  try {
    job = await getJob(actor.companyId as string, id);
    if (job.status !== 'uploaded' && job.status !== 'validated')
      rows = await listRows(actor.companyId as string, id, 200);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    job = null;
  }
  if (job === null) return <ErrorState description={t('s16Migration.common.loadError')} />;
  const report = job.report;
  const now = new Date();
  const canRollback =
    ['committed', 'failed', 'cancelled', 'rollback_partial'].includes(job.status) &&
    rollbackOpen({ rollbackUntil: job.rollbackUntil }, now);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={job.fileName}
        description={`${t(`s16Migration.sources.${job.source}` as StringKey)} - ${t(`s16Migration.targets.${job.target}` as StringKey)}`}
      />
      <p className="text-sm">
        <Badge variant="outline">{t(`s16Migration.states.${job.status}` as StringKey)}</Badge>{' '}
        {t('s16Migration.job.progress')}: {job.processed}/{job.total} -{' '}
        {t('s16Migration.history.columns.created')} {job.created},{' '}
        {t('s16Migration.history.columns.skipped')} {job.skipped},{' '}
        {t('s16Migration.history.columns.failed')} {job.failed}
      </p>
      {job.error ? <Alert variant="destructive">{job.error}</Alert> : null}

      {(job.status === 'uploaded' || job.status === 'validated') && canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Migration.job.mapping')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <MappingForm
                id={job.id}
                fields={job.fields}
                headers={job.headers}
                suggested={job.suggested}
                initialMapping={job.mapping}
                duplicateMode={job.duplicateMode}
                askCountry={job.target === 'clients'}
              />
              <h3 className="text-sm font-semibold">{t('s16Migration.job.sample')}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {job.headers.map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.sample.map((r, i) => (
                      <TableRow key={`${i}-${r.join('|').slice(0, 40)}`}>
                        {r.map((c, k) => (
                          <TableCell key={`${job.headers[k] ?? k}`} className="max-w-48 truncate">
                            {c}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {report.total !== undefined ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Migration.job.reportTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            {job.status === 'validated' ? (
              <p className="text-sm text-muted-foreground">
                {t('s16Migration.job.nothingWritten')}
              </p>
            ) : null}
            <dl className="grid gap-sp-12 text-sm sm:grid-cols-4">
              {(
                [
                  ['total', report.total],
                  ['valid', report.valid],
                  ['invalid', report.invalid],
                  ['wouldCreate', report.wouldCreate],
                  ['wouldSkip', report.wouldSkip],
                  ['inFile', report.duplicatesInFile],
                  ['inSystem', report.duplicatesInSystem],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">
                    {t(`s16Migration.job.${k}` as StringKey)}
                  </dt>
                  <dd className="text-lg font-semibold">{v ?? 0}</dd>
                </div>
              ))}
            </dl>
            {(report.warnings ?? []).length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">{t('s16Migration.job.warnings')}</h3>
                <ul className="list-disc pl-5 text-sm">
                  {(report.warnings ?? []).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(report.problems ?? []).length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">{t('s16Migration.job.problems')}</h3>
                <ul className="space-y-1 text-sm">
                  {(report.problems ?? []).map((p) => (
                    <li key={p.row}>
                      {t('s16Migration.job.row')} {p.row}: {p.messages.join(' ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.status === 'validated' && canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <JobButton
                  id={job.id}
                  action="start"
                  expected={report.wouldCreate ?? 0}
                  label={`${t('s16Migration.job.start')} (${t('s16Migration.job.confirm', { count: report.wouldCreate ?? 0 })})`}
                />
                <JobButton
                  id={job.id}
                  action="cancel"
                  variant="outline"
                  label={t('s16Migration.job.cancel')}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {['queued', 'running'].includes(job.status) && canManage ? (
        <JobButton
          id={job.id}
          action="cancel"
          variant="outline"
          label={t('s16Migration.job.cancel')}
        />
      ) : null}

      {canRollback && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Migration.job.rollbackTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            <p className="text-sm">
              {t('s16Migration.job.rollbackHelp', {
                hours: hoursLeft({ rollbackUntil: job.rollbackUntil }, now),
              })}
            </p>
            <JobButton
              id={job.id}
              action="rollback"
              variant="destructive"
              label={t('s16Migration.job.rollback')}
            />
          </CardContent>
        </Card>
      ) : job.status === 'committed' ? (
        <p className="text-sm text-muted-foreground">{t('s16Migration.job.rollbackOver')}</p>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Migration.job.rowsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Migration.job.columns.row')}</TableHead>
                  <TableHead>{t('s16Migration.job.columns.action')}</TableHead>
                  <TableHead>{t('s16Migration.job.columns.message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell>{r.row}</TableCell>
                    <TableCell>{t(`s16Migration.job.actions.${r.action}` as StringKey)}</TableCell>
                    <TableCell>{r.message ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
