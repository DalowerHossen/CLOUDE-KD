// path: app/(admin)/admin/storage/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MigrationPanel } from '@/components/storage/migration-panel';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { storageOverview, type StorageOverview } from '@/services/storage/admin-ops';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { MalwareHashForm, QuarantineButtons, StartMigrationForm } from './_components/admin-forms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Storage health' };

type Held = StorageOverview['quarantine'][number];
const utc = (v: string): string => v.replace('T', ' ').slice(0, 19);

const columns: readonly DataColumn<Held>[] = [
  { key: 'name', header: t('s05Storage.admin.colName'), primary: true, cell: (r) => r.name },
  {
    key: 'category',
    header: t('s05Storage.admin.colCategory'),
    hideOnMobile: true,
    cell: (r) => r.category,
  },
  {
    key: 'reason',
    header: t('s05Storage.admin.colReason'),
    cell: (r) => <span title={r.reason}>{r.reasonCode}</span>,
  },
  {
    key: 'time',
    header: t('s05Storage.admin.colTime'),
    hideOnMobile: true,
    cell: (r) => utc(r.createdAt),
  },
  { key: 'x', header: '', cell: (r) => <QuarantineButtons id={r.id} /> },
];

export default async function AdminStoragePage(): Promise<JSX.Element> {
  await requirePagePermission('storage.admin', 'platform', 'storage');
  let data: StorageOverview | null;
  try {
    data = await storageOverview();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.admin.title')}
        description={t('s05Storage.admin.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s05Storage.admin.loadError')} />
      ) : (
        <>
          <section
            className="grid gap-sp-12 sm:grid-cols-3"
            aria-label={t('s05Storage.admin.title')}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('s05Storage.admin.platform')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Badge variant={data.platform.ok ? 'outline' : 'destructive'}>
                  {data.platform.ok
                    ? t('s05Storage.admin.platformOk')
                    : t('s05Storage.admin.platformDown', { message: data.platform.message ?? '' })}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('s05Storage.admin.links')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {t('s05Storage.admin.linksText', {
                  connected: data.driveLinks.connected,
                  error: data.driveLinks.error,
                  revoked: data.driveLinks.revoked,
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('s05Storage.admin.files')}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {t('s05Storage.admin.filesText', {
                  supabase: data.files.supabase,
                  drive: data.files.googleDrive,
                })}
              </CardContent>
            </Card>
          </section>
          <section className="space-y-sp-12" aria-labelledby="moves-title">
            <h2 id="moves-title" className="text-h3 font-semibold">
              {t('s05Storage.admin.movesTitle')}
            </h2>
            <MigrationPanel mode="admin" migrations={data.migrations} />
            <h3 className="text-base font-semibold">{t('s05Storage.admin.startTitle')}</h3>
            <StartMigrationForm />
          </section>
          <section className="space-y-sp-12" aria-labelledby="held-title">
            <h2 id="held-title" className="text-h3 font-semibold">
              {t('s05Storage.admin.quarantineTitle')}
            </h2>
            <DataTable
              columns={columns}
              rows={data.quarantine}
              getRowId={(r) => r.id}
              caption={t('s05Storage.admin.quarantineTitle')}
              empty={<EmptyState title={t('s05Storage.admin.quarantineEmpty')} />}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="hash-title">
            <h2 id="hash-title" className="text-h3 font-semibold">
              {t('s05Storage.admin.hashTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('s05Storage.admin.hashHelp')}</p>
            <MalwareHashForm />
          </section>
        </>
      )}
    </div>
  );
}
