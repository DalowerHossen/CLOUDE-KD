// path: app/(dashboard)/purchase-orders/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PoActions } from '@/components/inventory/po-actions';
import { PoForm } from '@/components/inventory/po-form';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listWarehouses } from '@/services/inventory/warehouses';
import { getOrder, type PoView } from '@/services/purchase/orders';
import { searchSuppliers } from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Purchase order' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('po.read', 'tenant', 'purchase_order');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let order: PoView;
  try {
    order = await getOrder(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const [canWrite, canSend, canReceive, canBill, warehouses, suppliers] = await Promise.all([
    perms.can(actor, 'po.write', { type: 'purchase_order' }),
    perms.can(actor, 'po.send', { type: 'purchase_order' }),
    perms.can(actor, 'po.receive', { type: 'purchase_order' }),
    perms.can(actor, 'bill.write', { type: 'supplier_bill' }),
    listWarehouses(companyId).catch(() => []),
    searchSuppliers(companyId, { status: 'active' }).catch(() => ({ rows: [], next: null })),
  ]);
  const supplierList = suppliers.rows.map((s) => ({ id: s.id, name: s.name }));
  if (!supplierList.some((s) => s.id === order.supplierId))
    supplierList.push({ id: order.supplierId, name: order.supplierName });
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.orders.detailTitle', { number: order.number })}
        actions={
          <Link className="underline print:hidden" href="/purchase-orders">
            {t('s08Crm.orders.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-8">
        <Badge variant="outline">{t(`s08Crm.orders.statuses.${order.status}` as StringKey)}</Badge>
        <Link className="underline" href={`/suppliers/${order.supplierId}`}>
          {order.supplierName}
        </Link>
      </div>
      {order.status === 'pending_approval' ? (
        <p role="status" className="text-sm">
          {t('s08Crm.orders.waiting')}
        </p>
      ) : null}
      {order.rejectedReason ? (
        <p role="alert" className="text-sm text-destructive">
          {t('s08Crm.orders.rejected', { reason: order.rejectedReason })}
        </p>
      ) : null}
      {['sent', 'partial', 'received'].includes(order.status) && canBill ? (
        <p className="text-sm print:hidden">
          <Link className="underline" href={`/bills/new?order=${order.id}`}>
            {t('s08Crm.bills.fromOrder')}
          </Link>
        </p>
      ) : null}
      <PoActions
        id={order.id}
        status={order.status}
        lines={order.lines}
        canWrite={canWrite}
        canSend={canSend}
        canReceive={canReceive}
      />
      {order.status === 'draft' && canWrite ? (
        <PoForm
          order={order}
          suppliers={supplierList}
          warehouses={warehouses}
          defaultSupplierId={order.supplierId}
          today={order.orderDate}
        />
      ) : (
        <section className="space-y-sp-8">
          <p className="text-sm">
            {t('s08Crm.orders.warehouse')}: {order.warehouseName} - {t('s08Crm.orders.orderDate')}:{' '}
            {order.orderDate}
            {order.expectedDate
              ? ` - ${t('s08Crm.orders.expectedDate')}: ${order.expectedDate}`
              : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('s08Crm.orders.lines')}</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col">{t('s08Crm.orders.item')}</th>
                  <th scope="col">{t('s08Crm.orders.quantity')}</th>
                  <th scope="col">{t('s08Crm.orders.received')}</th>
                  <th scope="col">{t('s08Crm.orders.unitCost')}</th>
                  <th scope="col">{t('s08Crm.orders.lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.variantName ? `${l.productName} - ${l.variantName}` : l.productName}</td>
                    <td>{Number(l.quantity)}</td>
                    <td>{Number(l.receivedQty)}</td>
                    <td>{formatMoney(Money.parse(l.unitCost))}</td>
                    <td>{formatMoney(Money.parse(l.lineTotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid max-w-sm grid-cols-2 gap-sp-4 text-sm">
            <dt>{t('s08Crm.orders.subtotal')}</dt>
            <dd className="text-right">{formatMoney(Money.parse(order.subtotal))}</dd>
            <dt>{t('s08Crm.orders.tax')}</dt>
            <dd className="text-right">{formatMoney(Money.parse(order.taxTotal))}</dd>
            <dt className="font-semibold">{t('s08Crm.orders.orderTotal')}</dt>
            <dd className="text-right font-semibold">{formatMoney(Money.parse(order.total))}</dd>
          </dl>
          {order.notes ? <p className="text-sm">{order.notes}</p> : null}
        </section>
      )}
    </div>
  );
}
