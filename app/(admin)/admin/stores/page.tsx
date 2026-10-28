// path: app/(admin)/admin/stores/page.tsx
import type { Metadata } from 'next';
import { StoreActionButton } from '@/components/integration/commerce-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAllStores, type AdminStoreView } from '@/services/integration/admin-stores';
import { listCompanies } from '@/services/payment/onboarding';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { AdminConnect } from './_components/admin-connect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Online stores' };

export default async function AdminStoresPage(): Promise<JSX.Element> {
  await requirePagePermission('commerce.admin', 'platform', 'integration');
  let data: { stores: AdminStoreView[]; companies: { id: string; name: string }[] } | null;
  try {
    data = { stores: await listAllStores(), companies: await listCompanies() };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Commerce.admin.title')}
        description={t('s16Commerce.admin.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s16Commerce.admin.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Commerce.stores.connectTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('s16Commerce.admin.connectHelp')}</p>
            </CardHeader>
            <CardContent>
              <AdminConnect companies={data.companies} />
            </CardContent>
          </Card>
          {data.stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Commerce.admin.empty')}</p>
          ) : (
            <ul className="space-y-sp-12">
              {data.stores.map((s) => (
                <li key={s.id} className="space-y-2 rounded-md border p-sp-12 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {s.companyName} - {s.name} (
                      {s.provider === 'shopify' ? 'Shopify' : 'WooCommerce'}) - {s.storeUrl}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{s.status}</Badge>
                      <Badge variant={s.webhookReady ? 'default' : 'outline'}>
                        {s.webhookReady
                          ? t('s16Commerce.stores.webhookReady')
                          : t('s16Commerce.stores.webhookNotReady')}
                      </Badge>
                    </div>
                  </div>
                  <p className="break-all text-caption text-muted-foreground">
                    {t('s16Commerce.stores.columns.webhook')}: {s.webhookUrl}
                  </p>
                  {s.lastError ? <p className="text-destructive">{s.lastError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <StoreActionButton
                      endpoint={`/api/admin/stores/${s.companyId}/${s.id}/check`}
                      label={t('s16Commerce.stores.check')}
                      doneText={t('s16Commerce.common.done')}
                    />
                    <StoreActionButton
                      endpoint={`/api/admin/stores/${s.companyId}/${s.id}/webhooks`}
                      label={t('s16Commerce.stores.register')}
                      doneText={t('s16Commerce.stores.registered')}
                    />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {t('s16Commerce.stores.webhookHelp')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
