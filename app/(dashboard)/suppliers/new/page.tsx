// path: app/(dashboard)/suppliers/new/page.tsx
import type { Metadata } from 'next';
import { SupplierForm } from '@/components/inventory/supplier-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDefs } from '@/services/client/custom-fields';
import { supplierCategories } from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New supplier' };

export default async function NewSupplierPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('supplier.write', 'tenant', 'supplier');
  const companyId = actor.companyId as string;
  const [defs, categories] = await Promise.all([
    listDefs(companyId, 'supplier').catch(() => []),
    supplierCategories(companyId).catch(() => []),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s08Crm.suppliers.createTitle')} />
      <SupplierForm supplier={null} defs={defs} categories={categories} />
    </div>
  );
}
