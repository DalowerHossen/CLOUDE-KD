// path: app/(admin)/admin/bnpl/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { bnplReport, type BnplReport } from '@/services/bnpl/reports';
import { loadBnplRules } from '@/services/bnpl/settings';
import type { BnplRules } from '@/lib/payment/bnpl-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Installment pricing' };

const DAY = 86_400_000;

export default async function AdminBnplPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  const now = new Date();
  const from = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + DAY).toISOString().slice(0, 10);
  let data: { rules: BnplRules; report: BnplReport } | null;
  try {
    const [rules, report] = await Promise.all([
      // The platform values: a company id that has no row of its own gives the platform rules.
      loadBnplRules('00000000-0000-0000-0000-000000000000'),
      bnplReport(null, from, to),
    ]);
    data = { rules, report };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.bnpl.admin.title')}
        description={t('s14Wallet.bnpl.admin.description')}
      />
      {data === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.bnpl.admin.reportTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-sp-12 sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.plansCount')}</dt>
                  <dd className="font-semibold">{data.report.plans}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.volume')}</dt>
                  <dd className="font-semibold">{data.report.volume}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.fees')}</dt>
                  <dd className="font-semibold">{data.report.fees}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.defaultRate')}</dt>
                  <dd className="font-semibold">
                    {data.report.defaultRate === null
                      ? t('s14Wallet.bnpl.noDefaults')
                      : `${data.report.defaultRate}%`}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-sp-16">
              <JsonForm
                endpoint="/api/wallet/bnpl/platform"
                method="PUT"
                submitLabel={t('s14Wallet.common.save')}
                doneText={t('s14Wallet.bnpl.admin.saved')}
                fields={[
                  {
                    name: 'enabled',
                    label: t('s14Wallet.bnpl.admin.enabled'),
                    kind: 'checkbox',
                    initial: data.rules.platformEnabled ? 'true' : 'false',
                  },
                  {
                    name: 'terms',
                    label: t('s14Wallet.bnpl.admin.terms'),
                    list: true,
                    initial: data.rules.terms.join(';'),
                  },
                  {
                    name: 'feeList',
                    label: t('s14Wallet.bnpl.admin.fees'),
                    list: true,
                    initial: Object.entries(data.rules.feePercentByTerm)
                      .map(([term, pct]) => `${term}=${pct}`)
                      .join(';'),
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
