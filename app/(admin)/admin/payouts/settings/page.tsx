// path: app/(admin)/admin/payouts/settings/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { readOverrides } from '@/services/mor/settings';
import { loadPayoutRules } from '@/services/payout/settings';
import type { MorSettingsInput } from '@/lib/payment/mor-engine';
import type { PayoutRules } from '@/lib/payment/payout';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payout settings' };

const NO_COMPANY = '00000000-0000-0000-0000-000000000000';

export default async function PayoutSettingsPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  let mor: MorSettingsInput | null;
  let payout: PayoutRules | null;
  try {
    [mor, payout] = await Promise.all([readOverrides(null), loadPayoutRules(NO_COMPANY)]);
  } catch {
    mor = null;
    payout = null;
  }
  const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.admin.settingsTitle')}
        description={t('s14Wallet.admin.settingsDescription')}
      />
      {mor === null || payout === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.admin.settingsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/payouts/settings"
                method="PUT"
                emptyAsNull
                submitLabel={t('s14Wallet.common.save')}
                doneText={t('s14Wallet.admin.savedOk')}
                nest="payout"
                fields={[
                  {
                    name: 'minAmount',
                    label: t('s14Wallet.admin.minAmount'),
                    initial: payout.minAmount,
                  },
                  {
                    name: 'periodLimit',
                    label: t('s14Wallet.admin.periodLimit'),
                    initial: payout.periodLimit,
                  },
                  {
                    name: 'periodUnit',
                    label: t('s14Wallet.admin.periodUnit'),
                    initial: payout.periodUnit,
                    kind: 'select',
                    options: [
                      { value: 'day', label: 'day' },
                      { value: 'week', label: 'week' },
                      { value: 'month', label: 'month' },
                    ],
                  },
                  {
                    name: 'feeFixed',
                    label: t('s14Wallet.admin.feeFixed'),
                    initial: payout.feeFixed,
                  },
                  {
                    name: 'feePercent',
                    label: t('s14Wallet.admin.feePercent'),
                    initial: payout.feePercent,
                  },
                  {
                    name: 'fxFeePercent',
                    label: t('s14Wallet.admin.fxFeePercent'),
                    initial: payout.fxFeePercent,
                  },
                  {
                    name: 'largeThreshold',
                    label: t('s14Wallet.admin.largeThreshold'),
                    initial: payout.largeThreshold,
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.admin.morTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/payouts/settings"
                method="PUT"
                emptyAsNull
                submitLabel={t('s14Wallet.common.save')}
                doneText={t('s14Wallet.admin.savedOk')}
                nest="mor"
                fields={[
                  {
                    name: 'enabled',
                    label: t('s14Wallet.admin.morEnabled'),
                    kind: 'checkbox',
                    initial: mor.enabled ? 'true' : 'false',
                  },
                  {
                    name: 'holdDays',
                    label: t('s14Wallet.admin.holdDays'),
                    initial: s(mor.holdDays),
                    whole: true,
                  },
                  {
                    name: 'newMerchantHoldDays',
                    label: t('s14Wallet.admin.newMerchantHoldDays'),
                    initial: s(mor.newMerchantHoldDays),
                    whole: true,
                  },
                  {
                    name: 'newMerchantDays',
                    label: t('s14Wallet.admin.newMerchantDays'),
                    initial: s(mor.newMerchantDays),
                    whole: true,
                  },
                  {
                    name: 'reservePercent',
                    label: t('s14Wallet.admin.reservePercent'),
                    initial: s(mor.reservePercent),
                  },
                  {
                    name: 'reserveDays',
                    label: t('s14Wallet.admin.reserveDays'),
                    initial: s(mor.reserveDays),
                    whole: true,
                  },
                  {
                    name: 'cycleDays',
                    label: t('s14Wallet.admin.cycleDays'),
                    initial: s(mor.cycleDays),
                    whole: true,
                  },
                  {
                    name: 'dailyLimit',
                    label: t('s14Wallet.admin.dailyLimit'),
                    initial: s(mor.dailyLimit),
                  },
                  {
                    name: 'largePayment',
                    label: t('s14Wallet.admin.largePayment'),
                    initial: s(mor.largePayment),
                  },
                  {
                    name: 'velocityCount',
                    label: t('s14Wallet.admin.velocityCount'),
                    initial: s(mor.velocityCount),
                    whole: true,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
