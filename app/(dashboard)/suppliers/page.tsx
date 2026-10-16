// path: app/(dashboard)/suppliers/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { supplierListQuery } from '@/lib/procurement/suppliers';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  searchSuppliers,
  supplierCategories,
  type SupplierRow,
} from '@/services/supplier/suppliers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suppliers' };

const columns: readonly DataColumn<SupplierRow>[] = [
  { key: 'name', header: t('s08Crm.suppliers.name'), primary: true, cell: (r) => r.name },
  {
    key: 'email',
    header: t('s08Crm.suppliers.email'),
    hideOnMobile: true,
    cell: (r) => r.email ?? '-',
  },
  {
    key: 'phone',
    header: t('s08Crm.suppliers.phone'),
    hideOnMobile: true,
    cell: (r) => r.phone || '-',
  },
  {
    key: 'category',
    header: t('s08Crm.suppliers.category'),
    hideOnMobile: true,
    cell: (r) => r.category || '-',
  },
  {
    key: 'status',
    header: '',
    cell: (r) =>
      r.status === 'archived' ? (
        <Badge variant="outline">{t('s08Crm.suppliers.viewArchived')}</Badge>
      ) : null,
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/suppliers/${r.id}`}>
        {t('s08Crm.suppliers.open')}
      </Link>
    ),
  },
];

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('supplier.read', 'tenant', 'supplier');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = supplierListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : supplierListQuery.parse({});
  const companyId = actor.companyId as string;
  let result: Awaited<ReturnType<typeof searchSuppliers>> | null;
  let cats: string[] = [];
  try {
    [result, cats] = await Promise.all([
      searchSuppliers(companyId, query),
      supplierCategories(companyId).catch(() => []),
    ]);
  } catch {
    result = null;
  }
  const canWrite = await getService('permissions').can(actor, 'supplier.write', {
    type: 'supplier',
  });
  const base: Record<string, string> = {};
  if (query.q) base.q = query.q;
  if (query.status) base.status = query.status;
  if (query.category) base.category = query.category;
  const nextHref = result?.next
    ? `/suppliers?${new URLSearchParams({ ...base, after: result.next }).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.suppliers.title')}
        description={t('s08Crm.suppliers.description')}
        actions={
          canWrite ? (
            <Link className="underline" href="/suppliers/new">
              {t('s08Crm.suppliers.newSupplier')}
            </Link>
          ) : undefined
        }
      />
      <form
        action="/suppliers"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="lg:col-span-2">
          <span className="sr-only">{t('s08Crm.suppliers.search')}</span>
          <Input
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={80}
            placeholder={t('s08Crm.suppliers.search')}
          />
        </label>
        <NativeSelect
          name="category"
          defaultValue={query.category ?? ''}
          aria-label={t('s08Crm.suppliers.category')}
        >
          <option value="">{t('s08Crm.suppliers.allCategories')}</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="status"
          defaultValue={query.status ?? ''}
          aria-label={t('s08Crm.orders.status')}
        >
          <option value="">{t('s08Crm.orders.allStates')}</option>
          <option value="active">{t('s08Crm.suppliers.viewActive')}</option>
          <option value="archived">{t('s08Crm.suppliers.viewArchived')}</option>
        </NativeSelect>
        <div className="flex gap-sp-8">
          <Button type="submit">{t('s08Crm.suppliers.apply')}</Button>
          <Link className="self-center underline" href="/suppliers">
            {t('s08Crm.search.reset')}
          </Link>
        </div>
      </form>
      {result === null ? (
        <ErrorState description={t('s08Crm.suppliers.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.suppliers.title')}
            empty={<EmptyState title={t('s08Crm.suppliers.empty')} />}
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
