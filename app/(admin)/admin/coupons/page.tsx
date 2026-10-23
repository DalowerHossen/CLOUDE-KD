// path: app/(admin)/admin/coupons/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { listCoupons, type CouponView } from '@/services/coupon/coupons';
import { couponReport, type CouponReport } from '@/services/coupon/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Coupons' };

const DAY = 86_400_000;
const isDay = (v: string | undefined): v is string =>
  Boolean(v) && /^\d{4}-\d{2}-\d{2}$/.test(v as string);

function valueText(c: CouponView): string {
  if (c.kind === 'percent')
    return t('s14Wallet.coupons.valuePercent', { value: c.percentOff ?? '', cycles: c.cycles });
  if (c.kind === 'fixed')
    return t('s14Wallet.coupons.valueFixed', { value: c.amountOff ?? '', cycles: c.cycles });
  return t('s14Wallet.coupons.valueTrial', { value: c.trialDays ?? 0 });
}

const columns: readonly DataColumn<CouponView>[] = [
  { key: 'code', header: t('s14Wallet.coupons.columns.code'), primary: true, cell: (r) => r.code },
  {
    key: 'name',
    header: t('s14Wallet.coupons.columns.name'),
    hideOnMobile: true,
    cell: (r) => r.name,
  },
  { key: 'value', header: t('s14Wallet.coupons.columns.value'), cell: (r) => valueText(r) },
  {
    key: 'limits',
    header: t('s14Wallet.coupons.columns.limits'),
    hideOnMobile: true,
    cell: (r) =>
      t('s14Wallet.coupons.limitsLine', {
        max: r.maxRedemptions ?? t('s14Wallet.coupons.noLimit'),
        plans: r.planSlugs.length > 0 ? r.planSlugs.join(', ') : t('s14Wallet.coupons.anyPlan'),
        until: r.expiresAt ? r.expiresAt.slice(0, 10) : t('s14Wallet.coupons.noEnd'),
      }),
  },
  { key: 'used', header: t('s14Wallet.coupons.columns.used'), cell: (r) => String(r.redemptions) },
  {
    key: 'status',
    header: t('s14Wallet.coupons.columns.status'),
    cell: (r) => (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {r.enabled ? t('s14Wallet.coupons.on') : t('s14Wallet.coupons.off')}
        </Badge>
        <ActionButton
          endpoint={`/api/coupons/${r.id}`}
          method="PUT"
          body={{ version: r.version, changes: { enabled: !r.enabled } }}
          label={r.enabled ? t('s14Wallet.coupons.switchOff') : t('s14Wallet.coupons.switchOn')}
          doneText={t('s14Wallet.coupons.saved')}
        />
        {r.redemptions === 0 ? (
          <ActionButton
            endpoint={`/api/coupons/${r.id}`}
            method="DELETE"
            variant="destructive"
            label={t('s14Wallet.coupons.delete')}
            doneText={t('s14Wallet.coupons.deleted')}
          />
        ) : null}
      </span>
    ),
  },
];

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || actor.role !== 'super_admin') notFound();
  const q = await searchParams;
  const now = new Date();
  const to = isDay(q.to) ? q.to : new Date(now.getTime() + DAY).toISOString().slice(0, 10);
  const from = isDay(q.from)
    ? q.from
    : new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10);
  let rows: CouponView[] | null;
  let report: CouponReport | null = null;
  try {
    rows = await listCoupons(actor);
    if (from < to) report = await couponReport(actor, from, to);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.coupons.pageTitle')}
        description={t('s14Wallet.coupons.pageDescription')}
      />
      {rows === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.coupons.pageTitle')}
            empty={<EmptyState title={t('s14Wallet.coupons.pageTitle')} />}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.coupons.createTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/coupons"
                resetAfter
                submitLabel={t('s14Wallet.coupons.create')}
                doneText={t('s14Wallet.coupons.created')}
                fields={[
                  { name: 'code', label: t('s14Wallet.coupons.code') },
                  { name: 'name', label: t('s14Wallet.coupons.name'), required: true },
                  {
                    name: 'kind',
                    label: t('s14Wallet.coupons.kind'),
                    kind: 'select',
                    initial: 'percent',
                    options: (['percent', 'fixed', 'free_trial'] as const).map((k) => ({
                      value: k,
                      label: t(`s14Wallet.coupons.kinds.${k}` as StringKey),
                    })),
                  },
                  { name: 'percentOff', label: t('s14Wallet.coupons.percentOff') },
                  { name: 'amountOff', label: t('s14Wallet.coupons.amountOff') },
                  { name: 'trialDays', label: t('s14Wallet.coupons.trialDays'), whole: true },
                  {
                    name: 'cycles',
                    label: t('s14Wallet.coupons.cycles'),
                    initial: '1',
                    whole: true,
                  },
                  {
                    name: 'maxRedemptions',
                    label: t('s14Wallet.coupons.maxRedemptions'),
                    whole: true,
                  },
                  { name: 'expiresAt', label: t('s14Wallet.coupons.expiresAt') },
                  {
                    name: 'oncePerCompany',
                    label: t('s14Wallet.coupons.oncePerCompany'),
                    kind: 'checkbox',
                    initial: 'true',
                  },
                ]}
              />
            </CardContent>
          </Card>
          <section className="space-y-sp-8">
            <h2 className="text-h3 font-semibold">{t('s14Wallet.coupons.reportTitle')}</h2>
            <form method="get" className="flex flex-wrap items-end gap-sp-12">
              <div className="space-y-1">
                <Label htmlFor="from">{t('s14Wallet.coupons.from')}</Label>
                <Input id="from" name="from" type="date" defaultValue={from} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to">{t('s14Wallet.coupons.to')}</Label>
                <Input id="to" name="to" type="date" defaultValue={to} />
              </div>
              <Button type="submit">{t('s14Wallet.coupons.show')}</Button>
            </form>
            {report && report.rows.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('s14Wallet.coupons.totals', {
                    uses: report.totals.redemptions,
                    discount: report.totals.discountGiven,
                    revenue: report.totals.revenue,
                  })}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="py-1">{t('s14Wallet.coupons.reportColumns.code')}</th>
                      <th className="py-1">{t('s14Wallet.coupons.reportColumns.uses')}</th>
                      <th className="py-1">{t('s14Wallet.coupons.reportColumns.invoices')}</th>
                      <th className="py-1">{t('s14Wallet.coupons.reportColumns.discount')}</th>
                      <th className="py-1">{t('s14Wallet.coupons.reportColumns.revenue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.couponId} className="border-t">
                        <td className="py-1">{r.code}</td>
                        <td className="py-1">{r.redemptions}</td>
                        <td className="py-1">{r.invoices}</td>
                        <td className="py-1">{r.discountGiven}</td>
                        <td className="py-1">{r.revenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <EmptyState title={t('s14Wallet.coupons.reportEmpty')} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
