// path: app/(dashboard)/inventory/warehouses/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { WarehousesManager } from '@/components/inventory/warehouses-manager';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  ensureDefaultWarehouse,
  listWarehouses,
  type WarehouseView,
} from '@/services/inventory/warehouses';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Warehouses' };

export default async function WarehousesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'warehouse');
  let list: WarehouseView[] | null;
  try {
    await ensureDefaultWarehouse(actor.companyId as string);
    list = await listWarehouses(actor.companyId as string);
  } catch {
    list = null;
  }
  const canEdit = await getService('permissions').can(actor, 'inventory.warehouses', {
    type: 'warehouse',
  });
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.inventory.warehousesTitle')}
        description={t('s08Crm.inventory.warehousesDescription')}
        actions={
          <Link className="underline" href="/inventory">
            {t('s08Crm.inventory.title')}
          </Link>
        }
      />
      {list === null ? (
        <ErrorState description={t('s08Crm.inventory.loadError')} />
      ) : (
        <WarehousesManager warehouses={list} canEdit={canEdit} />
      )}
    </div>
  );
}
