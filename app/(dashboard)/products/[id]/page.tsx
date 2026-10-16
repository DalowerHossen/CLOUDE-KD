// path: app/(dashboard)/products/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImagesPanel } from '@/components/inventory/images-panel';
import { ProductActions } from '@/components/inventory/product-actions';
import { ProductForm } from '@/components/inventory/product-form';
import { RatesPanel } from '@/components/inventory/rates-panel';
import { VariantsPanel } from '@/components/inventory/variants-panel';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDefs } from '@/services/client/custom-fields';
import { listCategories } from '@/services/product/categories';
import { listRates } from '@/services/product/client-rates';
import { getProduct, type ProductView } from '@/services/product/products';
import { searchProducts } from '@/services/product/search';
import { listVariants } from '@/services/product/variants';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Item' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statusKey = {
  active: 'statusActive',
  inactive: 'statusInactive',
  archived: 'statusArchived',
} as const;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('product.read', 'tenant', 'product');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const companyId = actor.companyId as string;
  let product: ProductView;
  try {
    product = await getProduct(companyId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const perms = getService('permissions');
  const [canUpdate, canArchive, canDelete, canRates, categories, defs, items, variants, rates] =
    await Promise.all([
      perms.can(actor, 'product.update', { type: 'product' }),
      perms.can(actor, 'product.archive', { type: 'product' }),
      perms.can(actor, 'product.delete', { type: 'product' }),
      perms.can(actor, 'product.client_rates', { type: 'product' }),
      listCategories(companyId).catch(() => []),
      listDefs(companyId, 'product').catch(() => []),
      searchProducts(companyId, { status: 'active', sort: 'name', desc: '0' }).catch(() => ({
        rows: [],
        next: null,
      })),
      listVariants(companyId, id).catch(() => []),
      listRates(companyId, { productId: id }).catch(() => []),
    ]);
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s08Crm.products.detailTitle', { name: product.name })}
        actions={
          <Link className="underline" href="/products">
            {t('s08Crm.products.back')}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-sp-8">
        <Badge variant="outline">
          {t(`s08Crm.products.${statusKey[product.status]}` as StringKey)}
        </Badge>
        <ProductActions
          id={product.id}
          status={product.status}
          canArchive={canArchive}
          canDelete={canDelete}
        />
      </div>
      {canUpdate ? (
        <ProductForm
          product={product}
          kind={product.kind}
          categories={categories}
          defs={defs}
          candidates={items.rows
            .filter((r) => r.kind !== 'bundle' && r.id !== product.id)
            .map((r) => ({ id: r.id, name: r.name }))}
        />
      ) : null}
      <ImagesPanel productId={product.id} fileIds={product.imageFileIds} canEdit={canUpdate} />
      {product.kind === 'product' ? (
        <VariantsPanel productId={product.id} variants={variants} canEdit={canUpdate} />
      ) : null}
      {canRates ? <RatesPanel productId={product.id} rates={rates} canEdit={canRates} /> : null}
    </div>
  );
}
