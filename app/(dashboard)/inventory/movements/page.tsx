// path: app/(dashboard)/inventory/movements/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { movementsQuery } from '@/lib/stock/stock';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listMovements, type MovementRow } from '@/services/inventory/stock';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock history' };

const trim = (v: string): string => v.replace(/0+$/, '').replace(/\.$/, '');
const KINDS = [
  'receipt',
  'issue',
  'sale',
  'adjustment',
  'transfer_out',
  'transfer_in',
  'return_in',
  'return_out',
  'count',
] as const;

const columns: readonly DataColumn<MovementRow>[] = [
  {
    key: 'when',
    header: t('s08Crm.inventory.when'),
    cell: (r) => r.at.replace('T', ' ').slice(0, 16),
  },
  {
    key: 'product',
    header: t('s08Crm.inventory.product'),
    primary: true,
    cell: (r) => (
      <Link className="underline" href={`/products/${r.productId}`}>
        {r.productName}
        {r.variantName ? ` - ${r.variantName}` : ''}
      </Link>
    ),
  },
  {
    key: 'wh',
    header: t('s08Crm.inventory.warehouse'),
    hideOnMobile: true,
    cell: (r) => r.warehouseName,
  },
  {
    key: 'kind',
    header: t('s08Crm.inventory.kind'),
    cell: (r) => t(`s08Crm.inventory.kinds.${r.kind}` as StringKey),
  },
  { key: 'delta', header: t('s08Crm.inventory.change'), cell: (r) => trim(r.delta) },
  {
    key: 'balance',
    header: t('s08Crm.inventory.balance'),
    hideOnMobile: true,
    cell: (r) => trim(r.balance),
  },
  {
    key: 'reason',
    header: t('s08Crm.inventory.reason'),
    hideOnMobile: true,
    cell: (r) =>
      r.reason ? t(`s08Crm.inventory.reasons.${r.reason}` as StringKey) : (r.referenceType ?? '-'),
  },
];

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'stock');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = movementsQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : movementsQuery.parse({});
  let result: Awaited<ReturnType<typeof listMovements>> | null;
  try {
    result = await listMovements(actor.companyId as string, query);
  } catch {
    result = null;
  }
  const base = new URLSearchParams();
  if (query.kind) base.set('kind', query.kind);
  if (query.productId) base.set('productId', query.productId);
  if (query.warehouseId) base.set('warehouseId', query.warehouseId);
  const nextHref = result?.next
    ? `/inventory/movements?${new URLSearchParams([...base.entries(), ['after', result.next]]).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.inventory.movementsTitle')}
        description={t('s08Crm.inventory.movementsDescription')}
        actions={
          <Link className="underline" href="/inventory">
            {t('s08Crm.inventory.title')}
          </Link>
        }
      />
      <form
        action="/inventory/movements"
        method="get"
        className="flex flex-wrap items-end gap-sp-8 text-sm"
      >
        {query.productId ? <input type="hidden" name="productId" value={query.productId} /> : null}
        <NativeSelect
          name="kind"
          defaultValue={query.kind ?? ''}
          aria-label={t('s08Crm.inventory.kind')}
        >
          <option value="">{t('s08Crm.inventory.allKinds')}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`s08Crm.inventory.kinds.${k}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit">{t('s08Crm.inventory.apply')}</Button>
      </form>
      {result === null ? (
        <ErrorState description={t('s08Crm.inventory.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.inventory.movementsTitle')}
            empty={<EmptyState title={t('s08Crm.inventory.empty')} />}
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
