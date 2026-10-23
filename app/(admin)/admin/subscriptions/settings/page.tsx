// path: app/(admin)/admin/subscriptions/settings/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { loadBilling, type BillingSettings } from '@/services/subscription/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Billing settings' };

export default async function BillingSettingsPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  let b: BillingSettings | null;
  try {
    b = await loadBilling();
  } catch {
    b = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.adminSubs.settingsTitle')}
        description={t('s14Wallet.adminSubs.settingsDescription')}
      />
      {b === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <JsonForm
              endpoint="/api/subscriptions/settings"
              method="PUT"
              submitLabel={t('s14Wallet.common.save')}
              doneText={t('s14Wallet.adminSubs.saved')}
              fields={[
                {
                  name: 'sellerName',
                  label: t('s14Wallet.adminSubs.sellerName'),
                  initial: b.sellerName,
                },
                {
                  name: 'sellerAddress',
                  label: t('s14Wallet.adminSubs.sellerAddress'),
                  initial: b.sellerAddress,
                },
                {
                  name: 'sellerTaxId',
                  label: t('s14Wallet.adminSubs.sellerTaxId'),
                  initial: b.sellerTaxId,
                },
                {
                  name: 'bankInstructions',
                  label: t('s14Wallet.adminSubs.bankInstructions'),
                  initial: b.bankInstructions,
                },
                {
                  name: 'defaultTaxPercent',
                  label: t('s14Wallet.adminSubs.defaultTaxPercent'),
                  initial: b.defaultTaxPercent,
                },
                {
                  name: 'taxPercentByCountryText',
                  label: t('s14Wallet.adminSubs.taxByCountry'),
                  initial: Object.entries(b.taxPercentByCountry)
                    .map(([c, v]) => `${c}:${v}`)
                    .join(', '),
                },
                {
                  name: 'graceDays',
                  label: t('s14Wallet.adminSubs.graceDays'),
                  initial: String(b.graceDays),
                  whole: true,
                },
                {
                  name: 'operatorCompanyId',
                  label: t('s14Wallet.adminSubs.operatorCompanyId'),
                  initial: b.operatorCompanyId ?? '',
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
