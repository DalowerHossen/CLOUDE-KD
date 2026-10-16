// path: app/(dashboard)/inventory/valuation/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cogsQuery } from '@/lib/stock/stock';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  cogsReport,
  expiringBatches,
  valuationReport,
  type CogsRow,
  type ExpiringBatch,
  type ValuationRow,
} from '@/services/inventory/valuation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock value' };

const trim = (v: string): string => v.replace(/0+$/, '').replace(/\.$/, '');
const money = (v: string): string => formatMoney(Money.parse(v));
const methodKey = { average: 'methodAverage', fifo: 'methodFifo', lifo: 'methodLifo' } as const;

export default async function ValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.costs', 'tenant', 'stock');
  const companyId = actor.companyId as string;
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const parsed = cogsQuery.safeParse({ from: sp.from ?? monthStart, to: sp.to ?? today });
  const range = parsed.success ? parsed.data : { from: monthStart, to: today };
  let value: { rows: ValuationRow[]; total: string } | null;
  let cogs: { rows: CogsRow[]; total: string } | null;
  let expiring: ExpiringBatch[] = [];
  try {
    [value, cogs, expiring] = await Promise.all([
      valuationReport(companyId),
      cogsReport(companyId, range),
      expiringBatches(companyId, 30),
    ]);
  } catch {
    value = null;
    cogs = null;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.valuation.title')}
        description={t('s08Crm.valuation.description')}
        actions={
          <Link className="underline" href="/inventory">
            {t('s08Crm.inventory.title')}
          </Link>
        }
      />
      {value === null || cogs === null ? (
        <ErrorState description={t('s08Crm.inventory.loadError')} />
      ) : (
        <>
          <section className="space-y-sp-8">
            <p className="text-sm">
              {t('s08Crm.valuation.total')}: <strong>{money(value.total)}</strong>
            </p>
            {value.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('s08Crm.valuation.nothing')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>{t('s08Crm.inventory.product')}</th>
                    <th>{t('s08Crm.inventory.warehouse')}</th>
                    <th>{t('s08Crm.valuation.method')}</th>
                    <th className="text-right">{t('s08Crm.inventory.quantity')}</th>
                    <th className="text-right">{t('s08Crm.valuation.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {value.rows.map((r) => (
                    <tr key={`${r.productId}-${r.warehouseName}-${r.variantName}`}>
                      <td>
                        {r.productName}
                        {r.variantName ? ` - ${r.variantName}` : ''}
                      </td>
                      <td>{r.warehouseName}</td>
                      <td>{t(`s08Crm.valuation.${methodKey[r.method]}` as StringKey)}</td>
                      <td className="text-right">{trim(r.quantity)}</td>
                      <td className="text-right">{money(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{t('s08Crm.valuation.cogsTitle')}</h2>
            <form method="get" className="flex flex-wrap items-end gap-sp-8 text-sm">
              <label>
                <span className="block">{t('s08Crm.valuation.from')}</span>
                <Input type="date" name="from" defaultValue={range.from} />
              </label>
              <label>
                <span className="block">{t('s08Crm.valuation.to')}</span>
                <Input type="date" name="to" defaultValue={range.to} />
              </label>
              <Button type="submit">{t('s08Crm.valuation.show')}</Button>
            </form>
            {cogs.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('s08Crm.valuation.noSales')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>{t('s08Crm.inventory.product')}</th>
                    <th className="text-right">{t('s08Crm.valuation.sold')}</th>
                    <th className="text-right">{t('s08Crm.valuation.cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cogs.rows.map((r) => (
                    <tr key={r.productId}>
                      <td>{r.productName}</td>
                      <td className="text-right">{trim(r.quantity)}</td>
                      <td className="text-right">{money(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-sm">
              {t('s08Crm.valuation.cogsTotal')}: <strong>{money(cogs.total)}</strong>
            </p>
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{t('s08Crm.valuation.expiringTitle')}</h2>
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('s08Crm.valuation.noExpiring')}</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card text-sm">
                {expiring.map((b, i) => (
                  <li
                    key={`${b.productId}-${b.batchNo}-${i}`}
                    className="flex flex-wrap justify-between gap-sp-8 p-sp-12"
                  >
                    <span>
                      {b.productName} ({t('s08Crm.valuation.batch')} {b.batchNo}, {b.warehouseName})
                    </span>
                    <span className={b.expired ? 'text-destructive' : ''}>
                      {t('s08Crm.valuation.expires')} {b.expiresOn} - {t('s08Crm.valuation.left')}{' '}
                      {trim(b.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
