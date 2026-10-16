// path: app/(dashboard)/settings/storage/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { driveStatus, type DriveStatus } from '@/services/storage/drive-link';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { DrivePanel } from './_components/drive-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'File storage' };

const MB = 1024 * 1024;
const size = (bytes: number): string =>
  bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : `${(bytes / MB).toFixed(1)} MB`;

const NOTICE: Record<
  string,
  'connectedNotice' | 'cancelledNotice' | 'failedNotice' | 'errorNotice'
> = {
  connected: 'connectedNotice',
  cancelled: 'cancelledNotice',
  failed: 'failedNotice',
  error: 'errorNotice',
};

export default async function StorageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('storage.manage', 'tenant', 'storage');
  const params = await searchParams;
  const flag = typeof params.drive === 'string' ? params.drive : '';
  let data: DriveStatus | null;
  try {
    data = actor.companyId ? await driveStatus(actor.companyId) : null;
  } catch {
    data = null;
  }
  const percent =
    data && data.quotaBytes > 0
      ? Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100))
      : 0;
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.storage.title')}
        description={t('s05Storage.storage.description')}
      />
      <StepUpForm />
      {NOTICE[flag] ? (
        <Alert variant={flag === 'connected' ? 'success' : 'warning'}>
          <AlertDescription>{t(`s05Storage.storage.${NOTICE[flag]}`)}</AlertDescription>
        </Alert>
      ) : null}
      {data === null ? (
        <ErrorState description={t('s05Storage.storage.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {t('s05Storage.storage.providerTitle')}
                <Badge variant="outline">
                  {data.provider === 'google_drive'
                    ? t('s05Storage.storage.providerDrive')
                    : t('s05Storage.storage.providerSupabase')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{t('s05Storage.storage.filesOnDrive', { count: data.filesOnDrive })}</p>
              <p>{t('s05Storage.storage.filesOnSupabase', { count: data.filesOnSupabase })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('s05Storage.storage.usageTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t('s05Storage.storage.usageTitle')}
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={
                    percent >= 95
                      ? 'h-full bg-destructive'
                      : percent >= 80
                        ? 'h-full bg-warning'
                        : 'h-full bg-primary'
                  }
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-sm">
                {t('s05Storage.storage.usageText', {
                  used: size(data.usedBytes),
                  quota: size(data.quotaBytes),
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('s05Storage.storage.monthlyText', { limit: size(data.monthlyLimitBytes) })}
              </p>
              {percent >= 80 ? (
                <Alert variant={percent >= 100 ? 'destructive' : 'warning'}>
                  <AlertTitle>
                    {percent >= 100
                      ? t('s05Storage.storage.quota100')
                      : percent >= 95
                        ? t('s05Storage.storage.quota95')
                        : t('s05Storage.storage.quota80')}
                  </AlertTitle>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('s05Storage.storage.driveTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm">
                {!data.available
                  ? t('s05Storage.storage.driveUnavailable')
                  : data.state === 'none'
                    ? t('s05Storage.storage.driveNone')
                    : data.state === 'revoked'
                      ? t('s05Storage.storage.driveRevoked')
                      : data.state === 'error'
                        ? t('s05Storage.storage.driveError')
                        : data.email
                          ? t('s05Storage.storage.driveConnected', { email: data.email })
                          : t('s05Storage.storage.driveConnectedNoEmail')}
              </p>
              {data.driveQuotaLimit !== null && data.driveQuotaUsed !== null ? (
                <p className="text-sm text-muted-foreground">
                  {t('s05Storage.storage.driveQuota', {
                    used: size(data.driveQuotaUsed),
                    limit: size(data.driveQuotaLimit),
                  })}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">{t('s05Storage.storage.driveHelp')}</p>
              <DrivePanel
                state={data.state}
                available={data.available}
                filesOnDrive={data.filesOnDrive}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
