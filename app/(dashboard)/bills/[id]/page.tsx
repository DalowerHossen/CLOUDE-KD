// path: app/(dashboard)/bills/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BillActions } from '@/components/inventory/bill-actions';
import { BillForm, billLinesOf } from '@/components/inventory/bill-form';
import { PayForm } from '@/components/inventory/pay-form';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { getBill, type BillView } from '@/services/purchase/bills';
import { searchSuppliers } from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supplier bill' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (v: string): string => formatMoney(Money.parse(v));

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('bill.read', 'tenant', 'supplier_bill');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let bill: BillView;
  try {
    bill = await getBill(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const [canWrite, canOverride, canPay, suppliers] = await Promise.all([
    perms.can(actor, 'bill.write', { type: 'supplier_bill' }),
    perms.can(actor, 'bill.override', { type: 'supplier_bill' }),
    perms.can(actor, 'remittance.write', { type: 'supplier_remittance' }),
    searchSuppliers(companyId, { status: 'active' }).catch(() => ({ rows: [], next: null })),
  ]);
  const supplierList = suppliers.rows.map((s) => ({ id: s.id, name: s.name }));
  if (!supplierList.some((s) => s.id === bill.supplierId))
    supplierList.push({ id: bill.supplierId, name: bill.supplierName });
  const payable = bill.status === 'open' || bill.status === 'partial';
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.bills.detailTitle', { number: bill.number })}
        actions={
          <Link className="underline print:hidden" href="/bills">
            {t('s08Crm.bills.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-8 text-sm">
        <Badge variant="outline">{t(`s08Crm.bills.statuses.${bill.status}` as StringKey)}</Badge>
        <Link className="underline" href={`/suppliers/${bill.supplierId}`}>
          {bill.supplierName}
        </Link>
        {bill.purchaseOrderId ? (
          <Link className="underline" href={`/purchase-orders/${bill.purchaseOrderId}`}>
            {bill.purchaseOrderNumber}
          </Link>
        ) : null}
        <span>{t(`s08Crm.bills.match.${bill.matchStatus}` as StringKey)}</span>
      </div>
      {bill.matchNote ? (
        <p role="alert" className="text-sm text-destructive">
          {bill.matchNote}
        </p>
      ) : null}
      <BillActions
        id={bill.id}
        status={bill.status}
        mismatch={bill.matchStatus === 'mismatch'}
        canWrite={canWrite}
        canOverride={canOverride}
      />
      {bill.status === 'draft' && canWrite ? (
        <BillForm
          bill={bill}
          initial={{
            supplierId: bill.supplierId,
            purchaseOrderId: bill.purchaseOrderId,
            supplierInvoiceNo: bill.supplierInvoiceNo,
            billDate: bill.billDate,
            dueDate: bill.dueDate,
            notes: bill.notes,
            lines: billLinesOf(bill),
          }}
          suppliers={supplierList}
        />
      ) : (
        <section className="space-y-sp-8">
          <p className="text-sm">
            {t('s08Crm.bills.supplierInvoiceNo')}: {bill.supplierInvoiceNo || '-'} -{' '}
            {t('s08Crm.bills.billDate')}: {bill.billDate} - {t('s08Crm.bills.dueDate')}:{' '}
            {bill.dueDate}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('s08Crm.bills.lines')}</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col">{t('s08Crm.bills.lineDescription')}</th>
                  <th scope="col">{t('s08Crm.bills.quantity')}</th>
                  <th scope="col">{t('s08Crm.bills.unitCost')}</th>
                  <th scope="col">{t('s08Crm.bills.lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.productName || l.description}</td>
                    <td>{Number(l.quantity)}</td>
                    <td>{money(l.unitCost)}</td>
                    <td>{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid max-w-sm grid-cols-2 gap-sp-4 text-sm">
            <dt>{t('s08Crm.bills.subtotal')}</dt>
            <dd className="text-right">{money(bill.subtotal)}</dd>
            <dt>{t('s08Crm.bills.tax')}</dt>
            <dd className="text-right">{money(bill.taxTotal)}</dd>
            <dt className="font-semibold">{t('s08Crm.bills.total')}</dt>
            <dd className="text-right font-semibold">{money(bill.total)}</dd>
            <dt>{t('s08Crm.bills.paid')}</dt>
            <dd className="text-right">{money(bill.paidTotal)}</dd>
            <dt>{t('s08Crm.bills.balance')}</dt>
            <dd className="text-right">{money(bill.balance)}</dd>
          </dl>
          {bill.notes ? <p className="text-sm">{bill.notes}</p> : null}
        </section>
      )}
      {payable && canPay ? (
        <PayForm
          supplierId={bill.supplierId}
          bills={[{ id: bill.id, number: bill.number, balance: bill.balance }]}
          today={new Date().toISOString().slice(0, 10)}
        />
      ) : null}
    </div>
  );
}
