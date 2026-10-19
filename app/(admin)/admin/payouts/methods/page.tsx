// path: app/(admin)/admin/payouts/methods/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent } from '@/components/ui/card';
import { PAYMENT_METHODS, type PaymentMethodDefinition } from '@/config/payment-methods';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import type { PlatformRow } from '@/lib/payment/payment-methods';
import { platformRows } from '@/services/payout/payment-methods';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment methods' };

export default async function PlatformMethodsPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  let rows: PlatformRow[] | null;
  try {
    rows = await platformRows();
  } catch {
    rows = null;
  }
  const state = (def: PaymentMethodDefinition, rows: PlatformRow[]): string =>
    def.countries
      .map((c) => {
        const r =
          rows.find((x) => x.methodCode === def.code && x.country === c) ??
          rows.find((x) => x.methodCode === def.code && x.country === null);
        return `${c} ${r ? (r.enabled ? 'on' : 'off') : '-'}`;
      })
      .join(', ');
  const columns: readonly DataColumn<PaymentMethodDefinition>[] = [
    {
      key: 'method',
      header: t('s14Wallet.adminMethods.columns.method'),
      primary: true,
      cell: (r) => r.label,
    },
    {
      key: 'kind',
      header: t('s14Wallet.adminMethods.columns.kind'),
      hideOnMobile: true,
      cell: (r) => r.kind,
    },
    {
      key: 'countries',
      header: t('s14Wallet.adminMethods.columns.countries'),
      cell: (r) => state(r, rows ?? []),
    },
    {
      key: 'plan',
      header: t('s14Wallet.adminMethods.columns.plan'),
      hideOnMobile: true,
      cell: (r) => r.minPlan,
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.adminMethods.pageTitle')}
        description={t('s14Wallet.adminMethods.pageDescription')}
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={PAYMENT_METHODS}
            getRowId={(r) => r.code}
            caption={t('s14Wallet.adminMethods.pageTitle')}
            empty={null}
          />
          <Card>
            <CardContent className="pt-sp-16">
              <JsonForm
                endpoint="/api/payouts/platform-methods"
                method="PUT"
                emptyAsNull
                submitLabel={t('s14Wallet.adminMethods.save')}
                doneText={t('s14Wallet.adminMethods.saved')}
                fields={[
                  {
                    name: 'code',
                    label: t('s14Wallet.adminMethods.code'),
                    kind: 'select',
                    options: PAYMENT_METHODS.map((m) => ({ value: m.code, label: m.label })),
                    initial: PAYMENT_METHODS[0]?.code ?? '',
                  },
                  { name: 'country', label: t('s14Wallet.adminMethods.country') },
                  { name: 'enabled', label: t('s14Wallet.adminMethods.enabled'), kind: 'checkbox' },
                  { name: 'sortOrder', label: t('s14Wallet.adminMethods.order'), whole: true },
                  {
                    name: 'minPlan',
                    label: t('s14Wallet.adminMethods.minPlan'),
                    kind: 'select',
                    options: ['free', 'pro', 'business', 'enterprise'].map((p) => ({
                      value: p,
                      label: p,
                    })),
                    initial: 'free',
                  },
                  { name: 'instructions', label: t('s14Wallet.adminMethods.instructions') },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
