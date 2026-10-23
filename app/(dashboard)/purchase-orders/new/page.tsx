// path: app/(dashboard)/purchase-orders/new/page.tsx
import type { Metadata } from 'next';
import { PoForm } from '@/components/inventory/po-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { ensureDefaultWarehouse, listWarehouses } from '@/services/inventory/warehouses';
import { searchSuppliers } from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New purchase order' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('po.write', 'tenant', 'purchase_order');
  const companyId = actor.companyId as string;
  const supplier = (await searchParams).supplier ?? '';
  await ensureDefaultWarehouse(companyId);
  const [warehouses, suppliers] = await Promise.all([
    listWarehouses(companyId),
    searchSuppliers(companyId, { status: 'active' }).catch(() => ({ rows: [], next: null })),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s08Crm.orders.createTitle')} />
      <PoForm
        order={null}
        suppliers={suppliers.rows.map((s) => ({ id: s.id, name: s.name }))}
        warehouses={warehouses}
        defaultSupplierId={UUID.test(supplier) ? supplier : ''}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
