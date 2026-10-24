// path: app/(dashboard)/accounting/assets/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { CsvImportForm } from '@/components/accounting/csv-import-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { METHODS } from '@/services/asset/depreciation-rules';
import { listAssets, type AssetView } from '@/services/asset/assets';
import { listAssetCategories } from '@/services/asset/categories';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Fixed assets' };

const query = z.object({
  status: z.enum(['active', 'sold', 'disposed']).optional().catch(undefined),
  search: z.string().max(80).optional().catch(undefined),
});

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'fixed_asset');
  const companyId = actor.companyId as string;
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const canManage = await getService('permissions').can(actor, 'accounting.asset.manage', {
    type: 'fixed_asset',
  });
  let data: {
    assets: AssetView[];
    categories: Awaited<ReturnType<typeof listAssetCategories>>;
  } | null;
  try {
    const [assets, categories] = await Promise.all([
      listAssets(companyId, {
        ...(q.status ? { status: q.status } : {}),
        ...(q.search ? { search: q.search } : {}),
      }),
      listAssetCategories(companyId),
    ]);
    data = { assets, categories };
  } catch {
    data = null;
  }
  const nameOf = (id: string): string => data?.categories.find((c) => c.id === id)?.name ?? '';
  const columns: readonly DataColumn<AssetView>[] = [
    {
      key: 'name',
      header: t('s15Accounting.assets.columns.name'),
      primary: true,
      cell: (r) => (
        <Link
          href={`/accounting/assets/${r.id}`}
          prefetch={false}
          className="font-medium underline"
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: 'category',
      header: t('s15Accounting.assets.columns.category'),
      hideOnMobile: true,
      cell: (r) => nameOf(r.categoryId),
    },
    {
      key: 'cost',
      header: t('s15Accounting.assets.columns.cost'),
      cell: (r) => <span className="block text-right tabular-nums">{r.cost}</span>,
    },
    {
      key: 'acc',
      header: t('s15Accounting.assets.columns.accumulated'),
      hideOnMobile: true,
      cell: (r) => <span className="block text-right tabular-nums">{r.accumulated}</span>,
    },
    {
      key: 'nbv',
      header: t('s15Accounting.assets.columns.nbv'),
      cell: (r) => <span className="block text-right tabular-nums">{r.netBookValue}</span>,
    },
    {
      key: 'status',
      header: t('s15Accounting.assets.columns.status'),
      cell: (r) => (
        <Badge variant="outline">
          {t(`s15Accounting.assets.statuses.${r.status}` as StringKey)}
        </Badge>
      ),
    },
  ];
  const methodOptions = METHODS.map((m) => ({
    value: m,
    label: t(`s15Accounting.assets.methods.${m}` as StringKey),
  }));
  const today = new Date().toISOString().slice(0, 10);
  const hint = t('s15Accounting.assets.fields.dateHint');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.assets.title')}
        description={t('s15Accounting.assets.description')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/accounting/assets/categories" prefetch={false}>
                {t('s15Accounting.assets.categoriesLink')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/accounting/assets/reports" prefetch={false}>
                {t('s15Accounting.assets.reportsLink')}
              </Link>
            </Button>
          </>
        }
      />
      {data === null ? (
        <ErrorState description={t('s15Accounting.assets.loadError')} />
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-sp-8">
            <div className="space-y-1">
              <Label htmlFor="as-status">{t('s15Accounting.assets.filterStatus')}</Label>
              <NativeSelect id="as-status" name="status" defaultValue={q.status ?? ''}>
                <option value="">{t('s15Accounting.assets.allStatuses')}</option>
                {(['active', 'sold', 'disposed'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`s15Accounting.assets.statuses.${s}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="as-search">{t('s15Accounting.assets.search')}</Label>
              <Input id="as-search" name="search" defaultValue={q.search ?? ''} maxLength={80} />
            </div>
            <Button type="submit">{t('s15Accounting.assets.apply')}</Button>
          </form>
          <DataTable
            columns={columns}
            rows={data.assets}
            getRowId={(r) => r.id}
            caption={t('s15Accounting.assets.title')}
            empty={<EmptyState title={t('s15Accounting.assets.empty')} />}
          />
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.assets.addTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.assets.addHelp')}
                  </p>
                  <JsonForm
                    endpoint="/api/accounting/assets"
                    idempotent
                    resetAfter
                    submitLabel={t('s15Accounting.common.save')}
                    doneText={t('s15Accounting.assets.done')}
                    fields={[
                      {
                        name: 'name',
                        label: t('s15Accounting.assets.fields.name'),
                        required: true,
                      },
                      {
                        name: 'categoryId',
                        label: t('s15Accounting.assets.fields.category'),
                        kind: 'select',
                        required: true,
                        options: data.categories
                          .filter((c) => c.status === 'active')
                          .map((c) => ({ value: c.id, label: c.name })),
                      },
                      {
                        name: 'purchaseDate',
                        label: t('s15Accounting.assets.fields.purchaseDate'),
                        hint,
                        initial: today,
                        required: true,
                      },
                      {
                        name: 'inServiceDate',
                        label: t('s15Accounting.assets.fields.inServiceDate'),
                        hint,
                      },
                      {
                        name: 'cost',
                        label: t('s15Accounting.assets.fields.cost'),
                        required: true,
                      },
                      {
                        name: 'salvageValue',
                        label: t('s15Accounting.assets.fields.salvageValue'),
                      },
                      {
                        name: 'lifeMonths',
                        label: t('s15Accounting.assets.fields.lifeMonths'),
                        whole: true,
                        required: true,
                        initial: '60',
                      },
                      {
                        name: 'method',
                        label: t('s15Accounting.assets.fields.method'),
                        kind: 'select',
                        initial: 'straight_line',
                        options: methodOptions,
                      },
                      {
                        name: 'decliningFactor',
                        label: t('s15Accounting.assets.fields.decliningFactor'),
                      },
                      {
                        name: 'totalUnits',
                        label: t('s15Accounting.assets.fields.totalUnits'),
                      },
                      { name: 'location', label: t('s15Accounting.assets.fields.location') },
                      {
                        name: 'serialNumber',
                        label: t('s15Accounting.assets.fields.serialNumber'),
                      },
                      { name: 'vendor', label: t('s15Accounting.assets.fields.vendor') },
                      {
                        name: 'warrantyUntil',
                        label: t('s15Accounting.assets.fields.warrantyUntil'),
                        hint,
                      },
                      {
                        name: 'warrantyNote',
                        label: t('s15Accounting.assets.fields.warrantyNote'),
                      },
                      {
                        name: 'fundedFrom',
                        label: t('s15Accounting.assets.fields.fundedFrom'),
                        kind: 'select',
                        initial: 'none',
                        options: (['none', 'bank', 'payable'] as const).map((f) => ({
                          value: f,
                          label: t(`s15Accounting.assets.funded.${f}` as StringKey),
                        })),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.assets.runTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.assets.runHelp')}
                  </p>
                  <JsonForm
                    endpoint="/api/accounting/assets/depreciation/run"
                    idempotent
                    submitLabel={t('s15Accounting.assets.runButton')}
                    doneText={t('s15Accounting.assets.runDone')}
                    fields={[
                      {
                        name: 'throughMonth',
                        label: t('s15Accounting.assets.throughMonth'),
                        hint,
                        initial: `${today.slice(0, 7)}-01`,
                        required: true,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.assets.importTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CsvImportForm
                    endpoint="/api/accounting/assets/import"
                    help={t('s15Accounting.assets.importHelp')}
                    submitLabel={t('s15Accounting.assets.importButton')}
                    doneText={t('s15Accounting.assets.importDone')}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
