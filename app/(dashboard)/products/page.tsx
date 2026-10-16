// path: app/(dashboard)/products/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ViewsPanel } from '@/components/crm/views-panel';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { productListQuery, type ProductListQuery } from '@/lib/catalog/products';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listViews, type SavedView } from '@/services/client/views';
import { listCategories, type CategoryView } from '@/services/product/categories';
import { searchProducts, type ProductListItem } from '@/services/product/search';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Products and services' };

const kindKey = { product: 'kindProduct', service: 'kindService', bundle: 'kindBundle' } as const;
const statusKey = {
  active: 'statusActive',
  inactive: 'statusInactive',
  archived: 'statusArchived',
} as const;

const columns: readonly DataColumn<ProductListItem>[] = [
  { key: 'name', header: t('s08Crm.products.name'), primary: true, cell: (r) => r.name },
  { key: 'sku', header: t('s08Crm.products.sku'), hideOnMobile: true, cell: (r) => r.sku ?? '-' },
  {
    key: 'kind',
    header: t('s08Crm.products.kind'),
    hideOnMobile: true,
    cell: (r) => t(`s08Crm.products.${kindKey[r.kind]}` as StringKey),
  },
  {
    key: 'cat',
    header: t('s08Crm.products.category'),
    hideOnMobile: true,
    cell: (r) => r.categoryName || '-',
  },
  {
    key: 'price',
    header: t('s08Crm.products.price'),
    cell: (r) => `${formatMoney(Money.parse(r.unitPrice))} / ${r.unit}`,
  },
  {
    key: 'status',
    header: t('s08Crm.products.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.products.${statusKey[r.status]}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/products/${r.id}`}>
        {t('s08Crm.products.open')}
      </Link>
    ),
  },
];

function params(q: ProductListQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.q) out.q = q.q;
  if (q.status) out.status = q.status;
  if (q.kind) out.kind = q.kind;
  if (q.category) out.category = q.category;
  if (q.min) out.min = q.min;
  if (q.max) out.max = q.max;
  if (q.sort !== 'name') out.sort = q.sort;
  if (q.desc === '1') out.desc = '1';
  return out;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('product.read', 'tenant', 'product');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = productListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : productListQuery.parse({});
  const companyId = actor.companyId as string;
  let result: Awaited<ReturnType<typeof searchProducts>> | null;
  let cats: CategoryView[] = [];
  let views: SavedView[] = [];
  try {
    [result, cats, views] = await Promise.all([
      searchProducts(companyId, query),
      listCategories(companyId).catch(() => []),
      listViews(actor, 'products').catch(() => []),
    ]);
  } catch {
    result = null;
  }
  const base = params(query);
  const nextHref = result?.next
    ? `/products?${new URLSearchParams({ ...base, after: result.next }).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.products.title')}
        description={t('s08Crm.products.description')}
        actions={
          <>
            <Link className="underline" href="/products/categories">
              {t('s08Crm.products.categoriesLink')}
            </Link>
            <Link className="underline" href="/products/new">
              {t('s08Crm.products.newItem')}
            </Link>
          </>
        }
      />
      <form
        action="/products"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="lg:col-span-2">
          <span className="sr-only">{t('s08Crm.products.search')}</span>
          <Input
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={80}
            placeholder={t('s08Crm.products.search')}
          />
        </label>
        <NativeSelect
          name="kind"
          defaultValue={query.kind ?? ''}
          aria-label={t('s08Crm.products.kind')}
        >
          <option value="">{t('s08Crm.products.allKinds')}</option>
          <option value="product">{t('s08Crm.products.kindProduct')}</option>
          <option value="service">{t('s08Crm.products.kindService')}</option>
          <option value="bundle">{t('s08Crm.products.kindBundle')}</option>
        </NativeSelect>
        <NativeSelect
          name="status"
          defaultValue={query.status ?? ''}
          aria-label={t('s08Crm.products.status')}
        >
          <option value="">{t('s08Crm.products.allStates')}</option>
          <option value="active">{t('s08Crm.products.statusActive')}</option>
          <option value="inactive">{t('s08Crm.products.statusInactive')}</option>
          <option value="archived">{t('s08Crm.products.statusArchived')}</option>
        </NativeSelect>
        <NativeSelect
          name="category"
          defaultValue={query.category ?? ''}
          aria-label={t('s08Crm.products.category')}
        >
          <option value="">{t('s08Crm.products.allCategories')}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          name="min"
          inputMode="decimal"
          defaultValue={query.min ?? ''}
          maxLength={20}
          placeholder={t('s08Crm.products.minPrice')}
          aria-label={t('s08Crm.products.minPrice')}
        />
        <Input
          name="max"
          inputMode="decimal"
          defaultValue={query.max ?? ''}
          maxLength={20}
          placeholder={t('s08Crm.products.maxPrice')}
          aria-label={t('s08Crm.products.maxPrice')}
        />
        <NativeSelect name="sort" defaultValue={query.sort} aria-label={t('s08Crm.search.sortBy')}>
          <option value="name">{t('s08Crm.products.sortName')}</option>
          <option value="created">{t('s08Crm.products.sortCreated')}</option>
          <option value="price">{t('s08Crm.products.sortPrice')}</option>
        </NativeSelect>
        <label className="flex items-center gap-sp-8">
          <input type="checkbox" name="desc" value="1" defaultChecked={query.desc === '1'} />
          {t('s08Crm.search.desc')}
        </label>
        <div className="flex gap-sp-8">
          <Button type="submit">{t('s08Crm.search.apply')}</Button>
          <Link className="self-center underline" href="/products">
            {t('s08Crm.search.reset')}
          </Link>
        </div>
      </form>
      <ViewsPanel listKey="products" basePath="/products" views={views} current={base} />
      {result === null ? (
        <ErrorState description={t('s08Crm.products.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.products.title')}
            empty={<EmptyState title={t('s08Crm.products.empty')} />}
          />
          {nextHref ? (
            <p className="text-sm">
              <Link className="underline" href={nextHref}>
                {t('s08Crm.search.next')}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
