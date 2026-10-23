// path: app/(dashboard)/purchase-orders/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { PO_STATUSES, poListQuery } from '@/lib/procurement/orders';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listOrders, type PoRow } from '@/services/purchase/orders';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Purchase orders' };

const columns: readonly DataColumn<PoRow>[] = [
  { key: 'number', header: t('s08Crm.orders.number'), primary: true, cell: (r) => r.number },
  { key: 'supplier', header: t('s08Crm.orders.supplier'), cell: (r) => r.supplierName },
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

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('po.read', 'tenant', 'purchase_order');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = poListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : poListQuery.parse({});
  let result: Awaited<ReturnType<typeof listOrders>> | null;
  try {
    result = await listOrders(actor.companyId as string, query);
  } catch {
    result = null;
  }
  const canWrite = await getService('permissions').can(actor, 'po.write', {
    type: 'purchase_order',
  });
  const base: Record<string, string> = {};
  if (query.status) base.status = query.status;
  if (query.supplierId) base.supplierId = query.supplierId;
  const nextHref = result?.next
    ? `/purchase-orders?${new URLSearchParams({ ...base, after: result.next }).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.orders.title')}
        description={t('s08Crm.orders.description')}
        actions={
          canWrite ? (
            <Link className="underline" href="/purchase-orders/new">
              {t('s08Crm.orders.newOrder')}
            </Link>
          ) : undefined
        }
      />
      <form
        action="/purchase-orders"
        method="get"
        role="search"
        className="flex flex-wrap gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
      >
        <NativeSelect
          name="status"
          defaultValue={query.status ?? ''}
          aria-label={t('s08Crm.orders.status')}
        >
          <option value="">{t('s08Crm.orders.allStates')}</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`s08Crm.orders.statuses.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit">{t('s08Crm.orders.apply')}</Button>
      </form>
      {result === null ? (
        <ErrorState description={t('s08Crm.orders.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.orders.title')}
            empty={<EmptyState title={t('s08Crm.orders.empty')} />}
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
