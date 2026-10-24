// path: app/(dashboard)/products/new/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ProductForm } from '@/components/inventory/product-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDefs } from '@/services/client/custom-fields';
import { listCategories } from '@/services/product/categories';
import { searchProducts } from '@/services/product/search';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New item' };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('product.create', 'tenant', 'product');
  const companyId = actor.companyId as string;
  const kindParam = (await searchParams).kind;
  const kind = kindParam === 'service' ? 'service' : kindParam === 'bundle' ? 'bundle' : 'product';
  const [categories, defs, items] = await Promise.all([
    listCategories(companyId).catch(() => []),
    listDefs(companyId, 'product').catch(() => []),
    searchProducts(companyId, { status: 'active', sort: 'name', desc: '0' }).catch(() => ({
      rows: [],
      next: null,
    })),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s08Crm.products.createTitle')} />
      <ProductForm
        product={null}
        kind={kind}
        categories={categories}
        defs={defs}
        candidates={items.rows
          .filter((r) => r.kind !== 'bundle')
          .map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
