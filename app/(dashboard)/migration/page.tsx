// path: app/(dashboard)/migration/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { UploadForm } from '@/components/migration/migration-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
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
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listJobs, type JobView } from '@/services/migration/jobs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import from another tool' };

const jobPath = (id: string): string => ['/migration', id].join('/');

export default async function MigrationPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('migration.read', 'tenant', 'migration_job');
  const canManage = await getService('permissions').can(actor, 'migration.manage', {
    type: 'migration_job',
  });
  let jobs: JobView[] | null;
  try {
    jobs = await listJobs(actor.companyId as string);
  } catch {
    jobs = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s16Migration.title')} description={t('s16Migration.description')} />
      <p className="text-sm text-muted-foreground">{t('s16Migration.limits')}</p>
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Migration.upload.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadForm />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Migration.history.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs === null ? (
            <ErrorState description={t('s16Migration.common.loadError')} />
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Migration.history.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Migration.history.columns.file')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.source')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.target')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.state')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.rows')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.created')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.skipped')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.failed')}</TableHead>
                  <TableHead>{t('s16Migration.history.columns.when')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="break-all">{j.fileName}</TableCell>
                    <TableCell>{t(`s16Migration.sources.${j.source}` as StringKey)}</TableCell>
                    <TableCell>{t(`s16Migration.targets.${j.target}` as StringKey)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Migration.states.${j.status}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>{j.total}</TableCell>
                    <TableCell>{j.created}</TableCell>
                    <TableCell>{j.skipped}</TableCell>
                    <TableCell>{j.failed}</TableCell>
                    <TableCell>{j.createdAt.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell>
                      <Link href={jobPath(j.id)} prefetch={false} className="underline">
                        {t('s16Migration.history.open')}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
