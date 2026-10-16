// path: app/(dashboard)/suppliers/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SupplierActions } from '@/components/inventory/supplier-actions';
import { SupplierForm } from '@/components/inventory/supplier-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDefs } from '@/services/client/custom-fields';
import { listOrders, type PoRow } from '@/services/purchase/orders';
import { getSupplier, supplierCategories, type SupplierView } from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supplier' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const columns: readonly DataColumn<PoRow>[] = [
  { key: 'number', header: t('s08Crm.orders.number'), primary: true, cell: (r) => r.number },
  { key: 'date', header: t('s08Crm.orders.date'), hideOnMobile: true, cell: (r) => r.orderDate },
  {
    key: 'status',
    header: t('s08Crm.orders.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.orders.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'total',
    header: t('s08Crm.orders.total'),
    cell: (r) => formatMoney(Money.parse(r.total)),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/purchase-orders/${r.id}`}>
        {t('s08Crm.orders.open')}
      </Link>
    ),
  },
];

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('supplier.read', 'tenant', 'supplier');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let supplier: SupplierView;
  try {
    supplier = await getSupplier(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const [canWrite, canDelete, canOrder, defs, categories, orders] = await Promise.all([
    perms.can(actor, 'supplier.write', { type: 'supplier' }),
    perms.can(actor, 'supplier.delete', { type: 'supplier' }),
    perms.can(actor, 'po.write', { type: 'purchase_order' }),
    listDefs(companyId, 'supplier').catch(() => []),
    supplierCategories(companyId).catch(() => []),
    listOrders(companyId, { supplierId: id }).catch(() => ({ rows: [], next: null })),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.suppliers.detailTitle', { name: supplier.name })}
        actions={
          <Link className="underline" href="/suppliers">
            {t('s08Crm.suppliers.back')}
          </Link>
        }
      />
      <SupplierActions
        id={supplier.id}
        status={supplier.status}
        canWrite={canWrite}
        canDelete={canDelete}
      />
      {canWrite ? <SupplierForm supplier={supplier} defs={defs} categories={categories} /> : null}
      <section className="space-y-sp-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('s08Crm.suppliers.ordersTitle')}</h2>
          {canOrder ? (
            <Link className="underline" href={`/purchase-orders/new?supplier=${supplier.id}`}>
              {t('s08Crm.suppliers.newOrder')}
            </Link>
          ) : null}
        </div>
        <DataTable
          columns={columns}
          rows={orders.rows}
          getRowId={(r) => r.id}
          caption={t('s08Crm.suppliers.ordersTitle')}
          empty={<EmptyState title={t('s08Crm.suppliers.noOrders')} />}
        />
      </section>
    </div>
  );
}
