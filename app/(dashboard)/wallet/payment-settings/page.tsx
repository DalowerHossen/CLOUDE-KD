// path: app/(dashboard)/wallet/payment-settings/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import type { ResolvedMethod } from '@/lib/payment/payment-methods';
import { requirePagePermission } from '@/services/base/page-guard';
import { listForCompany, type CompanyMethodsView } from '@/services/payout/payment-methods';
import { ActionButton } from '../_components/action-button';
import { JsonForm } from '../_components/json-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment settings' };

export default async function PaymentSettingsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('wallet.read', 'tenant', 'payment_method');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'payment.methods.manage', {
    type: 'payment_method',
  });
  let view: CompanyMethodsView | null;
  try {
    view = await listForCompany(companyId);
  } catch {
    view = null;
  }
  const columns: readonly DataColumn<ResolvedMethod>[] = [
    {
      key: 'method',
      header: t('s14Wallet.paymentSettings.columns.method'),
      primary: true,
      cell: (r) => r.label,
    },
    {
      key: 'status',
      header: t('s14Wallet.paymentSettings.columns.status'),
      cell: (r) =>
        !r.platformEnabled ? (
          <Badge variant="outline">{t('s14Wallet.paymentSettings.notAvailable')}</Badge>
        ) : !r.planAllows ? (
          <Badge variant="outline">
            {t('s14Wallet.paymentSettings.needsPlan', { plan: r.minPlan })}
          </Badge>
        ) : (
          <Badge variant="outline">
            {r.enabled ? t('s14Wallet.paymentSettings.on') : t('s14Wallet.paymentSettings.off')}
          </Badge>
        ),
    },
    {
      key: 'order',
      header: t('s14Wallet.paymentSettings.columns.order'),
      hideOnMobile: true,
      cell: (r) => String(r.sortOrder),
    },
    {
      key: 'words',
      header: t('s14Wallet.paymentSettings.columns.words'),
      hideOnMobile: true,
      cell: (r) => r.instructions,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) =>
        canManage && r.platformEnabled && r.planAllows ? (
          <ActionButton
            endpoint="/api/wallet/payment-methods"
            method="PUT"
            body={{ code: r.code, enabled: !r.enabled }}
            variant={r.enabled ? 'outline' : 'default'}
            label={
              r.enabled
                ? t('s14Wallet.paymentSettings.switchOff')
                : t('s14Wallet.paymentSettings.switchOn')
            }
            doneText={t('s14Wallet.paymentSettings.saved')}
          />
        ) : null,
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.paymentSettings.pageTitle')}
        description={t('s14Wallet.paymentSettings.pageDescription')}
      />
      {view === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : view.country === null ? (
        <Alert>{t('s14Wallet.paymentSettings.noCountry')}</Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('s14Wallet.paymentSettings.planLine', {
              plan: view.planKey,
              count: view.enabledCount,
              limit: view.limit === null ? t('s14Wallet.paymentSettings.unlimited') : view.limit,
            })}{' '}
            {t('s14Wallet.paymentSettings.noKeys')}
          </p>
          <DataTable
            columns={columns}
            rows={view.methods}
            getRowId={(r) => r.code}
            caption={t('s14Wallet.paymentSettings.pageTitle')}
            empty={<EmptyState title={t('s14Wallet.paymentSettings.notAvailable')} />}
          />
          {canManage && view.methods.some((m) => m.platformEnabled && m.planAllows) ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s14Wallet.paymentSettings.editTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint="/api/wallet/payment-methods"
                  method="PUT"
                  submitLabel={t('s14Wallet.paymentSettings.saveWords')}
                  doneText={t('s14Wallet.paymentSettings.saved')}
                  emptyAsNull
                  fields={[
                    {
                      name: 'code',
                      label: t('s14Wallet.paymentSettings.code'),
                      kind: 'select',
                      options: view.methods
                        .filter((m) => m.platformEnabled && m.planAllows)
                        .map((m) => ({ value: m.code, label: m.label })),
                      initial:
                        view.methods.find((m) => m.platformEnabled && m.planAllows)?.code ?? '',
                    },
                    { name: 'sortOrder', label: t('s14Wallet.paymentSettings.order'), whole: true },
                    { name: 'instructions', label: t('s14Wallet.paymentSettings.instructions') },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
