// path: app/(dashboard)/bills/aging/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AGING_BUCKETS } from '@/lib/crm/aging';
import { t, type StringKey } from '@/lib/i18n';
import { agingQuery } from '@/lib/procurement/bills';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { payablesAging } from '@/services/purchase/statements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payables aging' };

const money = (v: string): string => formatMoney(Money.parse(v));

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('bill.read', 'tenant', 'supplier_bill');
  const today = new Date().toISOString().slice(0, 10);
  const parsed = agingQuery.safeParse({ asOf: (await searchParams).asOf ?? today });
  const asOf = parsed.success && parsed.data.asOf ? parsed.data.asOf : today;
  const data = await payablesAging(actor.companyId as string, asOf);
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.bills.aging.title')}
        description={t('s08Crm.bills.aging.description')}
        actions={
          <Link className="underline" href="/bills">
            {t('s08Crm.bills.back')}
          </Link>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-sp-8 text-sm">
        <label>
          <span className="block">{t('s08Crm.bills.aging.asOf')}</span>
          <Input type="date" name="asOf" defaultValue={asOf} />
        </label>
        <Button type="submit">{t('s08Crm.bills.apply')}</Button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState title={t('s08Crm.bills.aging.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('s08Crm.bills.aging.title')}</caption>
            <thead>
              <tr className="text-left">
                <th scope="col">{t('s08Crm.bills.supplier')}</th>
                {AGING_BUCKETS.map((b) => (
                  <th key={b} scope="col" className="text-right">
                    {t(`s08Crm.bills.aging.${b}` as StringKey)}
                  </th>
                ))}
                <th scope="col" className="text-right">
                  {t('s08Crm.bills.aging.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.supplierId}>
                  <td>
                    <Link className="underline" href={`/suppliers/${r.supplierId}/statement`}>
                      {r.supplierName}
                    </Link>
                  </td>
                  {AGING_BUCKETS.map((b) => (
                    <td key={b} className="text-right">
                      {money(r.buckets[b])}
                    </td>
                  ))}
                  <td className="text-right font-semibold">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" className="text-left">
                  {t('s08Crm.bills.aging.total')}
                </th>
                {AGING_BUCKETS.map((b) => (
                  <td key={b} className="text-right">
                    {money(data.totals[b])}
                  </td>
                ))}
                <td className="text-right">{money(data.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
