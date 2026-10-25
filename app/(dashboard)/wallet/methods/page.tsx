// path: app/(dashboard)/wallet/methods/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getSection } from '@/services/company/settings';
import { listMethods, type MethodView } from '@/services/payout/methods';
import { ActionButton } from '../_components/action-button';
import { PayoutMethodForm } from '../_components/payout-method-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payout methods' };

export default async function MethodsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('wallet.read', 'tenant', 'payout_method');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'payout.method.manage', {
    type: 'payout_method',
  });
  const country = (await getSection(companyId, 'profile')).value.country.trim().toUpperCase();
  let rows: MethodView[] | null;
  try {
    rows = await listMethods(companyId);
  } catch {
    rows = null;
  }
  const columns: readonly DataColumn<MethodView>[] = [
    {
      key: 'label',
      header: t('s14Wallet.methods.columns.label'),
      primary: true,
      cell: (r) => (
        <>
          {r.label}{' '}
          {r.isDefault ? (
            <Badge variant="outline">{t('s14Wallet.methods.defaultBadge')}</Badge>
          ) : null}
        </>
      ),
    },
    {
      key: 'kind',
      header: t('s14Wallet.methods.columns.kind'),
      hideOnMobile: true,
      cell: (r) => t(`s14Wallet.methods.kinds.${r.kind}` as StringKey),
    },
    { key: 'hint', header: t('s14Wallet.methods.columns.hint'), cell: (r) => r.hint },
    {
      key: 'currency',
      header: t('s14Wallet.methods.columns.currency'),
      hideOnMobile: true,
      cell: (r) => r.currency,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) =>
        canManage ? (
          <span className="flex flex-wrap gap-2">
            {r.isDefault ? null : (
              <ActionButton
                endpoint={`/api/payouts/methods/${r.id}`}
                method="PATCH"
                label={t('s14Wallet.methods.makeDefault')}
                doneText={t('s14Wallet.common.saved')}
              />
            )}
            <ActionButton
              endpoint={`/api/payouts/methods/${r.id}`}
              method="DELETE"
              variant="destructive"
              label={t('s14Wallet.methods.remove')}
              doneText={t('s14Wallet.methods.removed')}
            />
          </span>
        ) : null,
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.methods.pageTitle')}
        description={t('s14Wallet.methods.pageDescription')}
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s14Wallet.methods.pageTitle')}
          empty={<EmptyState title={t('s14Wallet.methods.listEmpty')} />}
        />
      )}
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s14Wallet.methods.addTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('s14Wallet.methods.stepUp')}</p>
          </CardHeader>
          <CardContent>
            <PayoutMethodForm defaultCountry={country} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
