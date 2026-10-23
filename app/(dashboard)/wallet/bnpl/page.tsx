// path: app/(dashboard)/wallet/bnpl/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import type { BnplRules } from '@/lib/payment/bnpl-rules';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPlans, type BnplPlanView } from '@/services/bnpl/installments';
import { offerableInvoices, type OfferableInvoice } from '@/services/bnpl/offers';
import { bnplReport, type BnplReport } from '@/services/bnpl/reports';
import { loadBnplRules } from '@/services/bnpl/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Installments' };

const DAY = 86_400_000;

export default async function BnplPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('client_subscription.read', 'tenant', 'bnpl');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'client_subscription.manage', {
    type: 'bnpl',
  });
  const now = new Date();
  const from = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + DAY).toISOString().slice(0, 10);
  let loaded: {
    rules: BnplRules;
    plans: BnplPlanView[];
    report: BnplReport;
    invoices: OfferableInvoice[];
  } | null;
  try {
    const [rules, plans, report, invoices] = await Promise.all([
      loadBnplRules(companyId),
      listPlans(companyId),
      bnplReport(companyId, from, to),
      offerableInvoices(companyId),
    ]);
    loaded = { rules, plans, report, invoices };
  } catch {
    loaded = null;
  }
  const columns: readonly DataColumn<BnplPlanView>[] = [
    {
      key: 'invoice',
      header: t('s14Wallet.bnpl.columns.invoice'),
      primary: true,
      cell: (r) => r.invoiceId.slice(0, 8),
    },
    { key: 'terms', header: t('s14Wallet.bnpl.columns.terms'), cell: (r) => String(r.terms) },
    { key: 'principal', header: t('s14Wallet.bnpl.columns.principal'), cell: (r) => r.principal },
    {
      key: 'fee',
      header: t('s14Wallet.bnpl.columns.fee'),
      hideOnMobile: true,
      cell: (r) => r.sellerFee,
    },
    {
      key: 'late',
      header: t('s14Wallet.bnpl.columns.late'),
      hideOnMobile: true,
      cell: (r) => String(r.missedCount),
    },
    {
      key: 'status',
      header: t('s14Wallet.bnpl.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`s14Wallet.bnpl.statuses.${r.status}` as StringKey)}</Badge>
          {canManage && r.status === 'active' ? (
            <ActionButton
              endpoint={`/api/wallet/bnpl/plans/${r.id}/cancel`}
              label={t('s14Wallet.bnpl.cancel')}
              doneText={t('s14Wallet.bnpl.cancelled')}
            />
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.bnpl.pageTitle')}
        description={t('s14Wallet.bnpl.pageDescription')}
      />
      {loaded === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          {!loaded.rules.platformEnabled ? <Alert>{t('s14Wallet.bnpl.notAvailable')}</Alert> : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.bnpl.reportTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-sp-12 sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.plansCount')}</dt>
                  <dd className="font-semibold">{loaded.report.plans}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.volume')}</dt>
                  <dd className="font-semibold">{loaded.report.volume}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.fees')}</dt>
                  <dd className="font-semibold">{loaded.report.fees}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.bnpl.defaultRate')}</dt>
                  <dd className="font-semibold">
                    {loaded.report.defaultRate === null
                      ? t('s14Wallet.bnpl.noDefaults')
                      : `${loaded.report.defaultRate}%`}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <DataTable
            columns={columns}
            rows={loaded.plans}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.bnpl.plansTitle')}
            empty={<EmptyState title={t('s14Wallet.bnpl.empty')} />}
          />
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s14Wallet.bnpl.offerTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {loaded.invoices.length === 0 ? (
                    <Alert>{t('s14Wallet.bnpl.noInvoices')}</Alert>
                  ) : (
                    <JsonForm
                      endpoint="/api/wallet/bnpl/offers"
                      idempotent
                      resetAfter
                      submitLabel={t('s14Wallet.bnpl.accept')}
                      doneText={t('s14Wallet.bnpl.accepted')}
                      fields={[
                        {
                          name: 'invoiceId',
                          label: t('s14Wallet.bnpl.invoice'),
                          kind: 'select',
                          initial: loaded.invoices[0]?.id ?? '',
                          options: loaded.invoices.map((i) => ({
                            value: i.id,
                            label: `${i.number} - ${i.amountDue} USD`,
                          })),
                        },
                        {
                          name: 'terms',
                          label: t('s14Wallet.bnpl.terms1'),
                          kind: 'select',
                          whole: true,
                          initial: String(loaded.rules.terms[0] ?? 3),
                          options: loaded.rules.terms.map((n) => ({
                            value: String(n),
                            label: String(n),
                          })),
                        },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s14Wallet.bnpl.settingsTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/wallet/bnpl"
                    method="PUT"
                    submitLabel={t('s14Wallet.common.save')}
                    doneText={t('s14Wallet.bnpl.settingsSaved')}
                    fields={[
                      {
                        name: 'enabled',
                        label: t('s14Wallet.bnpl.enabled'),
                        kind: 'checkbox',
                        initial: loaded.rules.companyEnabled ? 'true' : 'false',
                      },
                      {
                        name: 'terms',
                        label: t('s14Wallet.bnpl.terms'),
                        list: true,
                        initial: loaded.rules.terms.join(';'),
                      },
                      {
                        name: 'minAmount',
                        label: t('s14Wallet.bnpl.minAmount'),
                        initial: loaded.rules.minAmount,
                      },
                      {
                        name: 'maxAmount',
                        label: t('s14Wallet.bnpl.maxAmount'),
                        initial: loaded.rules.maxAmount,
                      },
                      {
                        name: 'minPaidInvoices',
                        label: t('s14Wallet.bnpl.minPaid'),
                        whole: true,
                        initial: String(loaded.rules.minPaidInvoices),
                      },
                      {
                        name: 'missedLimit',
                        label: t('s14Wallet.bnpl.missedLimit'),
                        whole: true,
                        initial: String(loaded.rules.missedLimit),
                      },
                      {
                        name: 'graceDays',
                        label: t('s14Wallet.bnpl.graceDays'),
                        whole: true,
                        initial: String(loaded.rules.graceDays),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
