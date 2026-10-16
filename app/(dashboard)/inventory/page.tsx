// path: app/(dashboard)/inventory/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { levelsQuery } from '@/lib/stock/stock';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  ensureDefaultWarehouse,
  listWarehouses,
  type WarehouseView,
} from '@/services/inventory/warehouses';
import { listLevels, type LevelRow } from '@/services/inventory/stock';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Inventory' };

const trim = (v: string): string => v.replace(/0+$/, '').replace(/\.$/, '');
const stateKey = { ok: 'stateOk', low: 'stateLow', out: 'stateOut' } as const;

const columns: readonly DataColumn<LevelRow>[] = [
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
  { key: 'sku', header: t('s08Crm.products.sku'), hideOnMobile: true, cell: (r) => r.sku ?? '-' },
  { key: 'wh', header: t('s08Crm.inventory.warehouse'), cell: (r) => r.warehouseName },
  { key: 'qty', header: t('s08Crm.inventory.quantity'), cell: (r) => trim(r.quantity) },
  {
    key: 'reorder',
    header: t('s08Crm.inventory.reorder'),
    hideOnMobile: true,
    cell: (r) => (r.reorderLevel ? trim(r.reorderLevel) : '-'),
  },
  {
    key: 'state',
    header: t('s08Crm.inventory.state'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.inventory.${stateKey[r.state]}` as StringKey)}</Badge>
    ),
  },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'stock');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = levelsQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : levelsQuery.parse({});
  const companyId = actor.companyId as string;
  let rows: LevelRow[] | null;
  let warehouses: WarehouseView[] = [];
  try {
    await ensureDefaultWarehouse(companyId);
    [rows, warehouses] = await Promise.all([
      listLevels(companyId, query),
      listWarehouses(companyId),
    ]);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.inventory.title')}
        description={t('s08Crm.inventory.description')}
        actions={
          <>
            <Link className="underline" href="/inventory/movements">
              {t('s08Crm.inventory.movementsLink')}
            </Link>
            <Link className="underline" href="/inventory/documents">
              {t('s08Crm.documents.title')}
            </Link>
            <Link className="underline" href="/inventory/valuation">
              {t('s08Crm.valuation.link')}
            </Link>
            <Link className="underline" href="/inventory/warehouses">
              {t('s08Crm.inventory.warehousesLink')}
            </Link>
          </>
        }
      />
      <form
        action="/inventory"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <Input
          name="q"
          defaultValue={query.q ?? ''}
          maxLength={80}
          placeholder={t('s08Crm.inventory.search')}
          aria-label={t('s08Crm.inventory.search')}
        />
        <NativeSelect
          name="warehouseId"
          defaultValue={query.warehouseId ?? ''}
          aria-label={t('s08Crm.inventory.warehouse')}
        >
          <option value="">{t('s08Crm.inventory.allWarehouses')}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-sp-8">
          <input type="checkbox" name="low" value="1" defaultChecked={query.low === '1'} />
          {t('s08Crm.inventory.onlyLow')}
        </label>
        <Button type="submit">{t('s08Crm.inventory.apply')}</Button>
      </form>
      {rows === null ? (
        <ErrorState description={t('s08Crm.inventory.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => `${r.warehouseId}-${r.productId}-${r.variantId ?? 'x'}`}
          caption={t('s08Crm.inventory.title')}
          empty={<EmptyState title={t('s08Crm.inventory.empty')} />}
        />
      )}
    </div>
  );
}
