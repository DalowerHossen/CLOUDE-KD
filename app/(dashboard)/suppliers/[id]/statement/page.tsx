// path: app/(dashboard)/suppliers/[id]/statement/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/crm/print-button';
import { PayForm } from '@/components/inventory/pay-form';
import { RemittanceCancel } from '@/components/inventory/remittance-cancel';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AGING_BUCKETS } from '@/lib/crm/aging';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { supplierStatementQuery } from '@/lib/procurement/bills';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listBills } from '@/services/purchase/bills';
import { listRemittances } from '@/services/purchase/remittances';
import { supplierStatement, type SupplierStatement } from '@/services/purchase/statements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supplier statement' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: string): string => formatMoney(Money.parse(v));

export default async function SupplierStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('bill.read', 'tenant', 'supplier_bill');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const parsed = supplierStatementQuery.safeParse({
    from: sp.from ?? yearStart,
    to: sp.to ?? today,
  });
  const range = parsed.success ? parsed.data : { from: yearStart, to: today };
  let data: SupplierStatement;
  try {
    data = await supplierStatement(companyId, id, range);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const canPay = await getService('permissions').can(actor, 'remittance.write', {
    type: 'supplier_remittance',
  });
  const [remittances, openBills] = await Promise.all([
    listRemittances(companyId, id).catch(() => []),
    canPay
      ? Promise.all([
          listBills(companyId, { supplierId: id, status: 'open' }),
          listBills(companyId, { supplierId: id, status: 'partial' }),
        ])
          .then(([a, b]) => [...a.rows, ...b.rows])
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16 print:max-w-none">
      <PageHeader
        title={t('s08Crm.bills.statement.title', { name: data.supplier.name })}
        actions={
          <Link className="underline print:hidden" href={`/suppliers/${id}`}>
            {t('s08Crm.suppliers.back')}
          </Link>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-sp-8 text-sm print:hidden">
        <label>
          <span className="block">{t('s08Crm.bills.statement.from')}</span>
          <Input type="date" name="from" defaultValue={range.from} />
        </label>
        <label>
          <span className="block">{t('s08Crm.bills.statement.to')}</span>
          <Input type="date" name="to" defaultValue={range.to} />
        </label>
        <Button type="submit">{t('s08Crm.bills.statement.show')}</Button>
        <PrintButton label={t('s08Crm.orders.print')} />
      </form>
      <p className="text-sm">
        {t('s08Crm.bills.statement.opening')}: <strong>{money(data.opening)}</strong>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{data.supplier.name}</caption>
          <thead>
            <tr className="text-left">
              <th scope="col">{t('s08Crm.bills.statement.date')}</th>
              <th scope="col">{t('s08Crm.bills.statement.kind')}</th>
              <th scope="col">{t('s08Crm.bills.statement.reference')}</th>
              <th scope="col" className="text-right">
                {t('s08Crm.bills.statement.amount')}
              </th>
              <th scope="col" className="text-right">
                {t('s08Crm.bills.statement.balance')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={5}>{t('s08Crm.bills.statement.empty')}</td>
              </tr>
            ) : (
              data.lines.map((l) => (
                <tr key={`${l.kind}-${l.reference}`}>
                  <td>{l.on}</td>
                  <td>{t(`s08Crm.bills.statement.${l.kind}` as StringKey)}</td>
                  <td>{l.reference}</td>
                  <td className="text-right">
                    {l.kind === 'remittance' ? `-${money(l.amount)}` : money(l.amount)}
                  </td>
                  <td className="text-right">{money(l.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        {t('s08Crm.bills.statement.closing')}: <strong>{money(data.closing)}</strong>
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('s08Crm.bills.aging.title')}</caption>
        <thead>
          <tr>
            {AGING_BUCKETS.map((b) => (
              <th key={b} scope="col" className="text-right">
                {t(`s08Crm.bills.aging.${b}` as StringKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {AGING_BUCKETS.map((b) => (
              <td key={b} className="text-right">
                {money(data.aging[b])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {canPay ? (
        <PayForm
          supplierId={id}
          bills={openBills.map((b) => ({ id: b.id, number: b.number, balance: b.balance }))}
          today={today}
        />
      ) : null}
      {remittances.length > 0 ? (
        <section className="space-y-sp-8">
          <h2 className="text-lg font-semibold">{t('s08Crm.bills.statement.remittances')}</h2>
          <ul className="space-y-sp-4 text-sm">
            {remittances.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-sp-8">
                <span>
                  {r.number} - {r.paidOn} - {t(`s08Crm.bills.methods.${r.method}` as StringKey)} -{' '}
                  {money(r.amount)}
                  {r.bills.length > 0 ? ` (${r.bills.map((b) => b.billNumber).join(', ')})` : ''}
                </span>
                {r.status === 'void' ? (
                  <span>{t('s08Crm.bills.statement.cancelled')}</span>
                ) : canPay ? (
                  <RemittanceCancel id={r.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
