// path: app/(dashboard)/products/categories/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CategoriesManager } from '@/components/inventory/categories-manager';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listCategories, type CategoryView } from '@/services/product/categories';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('product.read', 'tenant', 'product');
  let categories: CategoryView[] | null;
  try {
    categories = await listCategories(actor.companyId as string);
  } catch {
    categories = null;
  }
  const canEdit = await getService('permissions').can(actor, 'product.update', { type: 'product' });
  return (
    <div className="mx-auto max-w-2xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.products.categoriesTitle')}
        description={t('s08Crm.products.categoriesDescription')}
        actions={
          <Link className="underline" href="/products">
            {t('s08Crm.products.back')}
          </Link>
        }
      />
      {categories === null ? (
        <ErrorState description={t('s08Crm.products.loadError')} />
      ) : (
        <CategoriesManager categories={categories} canEdit={canEdit} />
      )}
    </div>
  );
}
