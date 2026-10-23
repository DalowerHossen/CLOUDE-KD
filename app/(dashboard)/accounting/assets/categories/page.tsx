// path: app/(dashboard)/accounting/assets/categories/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { listAccounts } from '@/services/accounting/accounts';
import { listAssetCategories, type AssetCategoryView } from '@/services/asset/categories';
import { METHODS } from '@/services/asset/depreciation-rules';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Asset categories' };

export default async function AssetCategoriesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.asset.manage', 'tenant', 'asset_category');
  const companyId = actor.companyId as string;
  let data: {
    categories: AssetCategoryView[];
    accounts: { id: string; type: string; contra: boolean; label: string }[];
  } | null;
  try {
    const [categories, accounts] = await Promise.all([
      listAssetCategories(companyId),
      listAccounts(companyId, { status: 'active' }),
    ]);
    data = {
      categories,
      accounts: accounts
        .filter((a) => a.allowPosting)
        .map((a) => ({
          id: a.id,
          type: a.type,
          contra: a.isContra,
          label: `${a.code} ${a.name}`,
        })),
    };
  } catch {
    data = null;
  }
  const pick = (
    label: string,
    name: string,
    filter: (a: { type: string; contra: boolean }) => boolean,
  ): {
    name: string;
    label: string;
    kind: 'select';
    initial: string;
    options: { value: string; label: string }[];
  } => ({
    name,
    label,
    kind: 'select',
    initial: '',
    options: [
      { value: '', label: t('s15Accounting.assets.categories.defaultAccount') },
      ...(data?.accounts ?? []).filter(filter).map((a) => ({ value: a.id, label: a.label })),
    ],
  });
  const columns: readonly DataColumn<AssetCategoryView>[] = [
    {
      key: 'name',
      header: t('s15Accounting.assets.categories.columns.name'),
      primary: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          {r.name}
          {r.status === 'inactive' ? (
            <Badge variant="outline">{t('s15Accounting.assets.categories.inactive')}</Badge>
          ) : null}
          <ActionButton
            endpoint={`/api/accounting/assets/categories/${r.id}`}
            method="PATCH"
            body={{ version: r.version, status: r.status === 'active' ? 'inactive' : 'active' }}
            label={
              r.status === 'active'
                ? t('s15Accounting.assets.categories.deactivate')
                : t('s15Accounting.assets.categories.activate')
            }
            doneText={t('s15Accounting.assets.done')}
          />
        </span>
      ),
    },
    {
      key: 'method',
      header: t('s15Accounting.assets.categories.columns.method'),
      cell: (r) => t(`s15Accounting.assets.methods.${r.method}` as StringKey),
    },
    {
      key: 'life',
      header: t('s15Accounting.assets.categories.columns.life'),
      cell: (r) => String(r.lifeMonths),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.assets.categories.title')}
        description={t('s15Accounting.assets.categories.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Accounting.assets.loadError')} />
      ) : (
        <>
          {data.categories.length === 0 ? (
            <ActionButton
              endpoint="/api/accounting/assets/categories/seed"
              variant="default"
              label={t('s15Accounting.assets.categories.seed')}
              doneText={t('s15Accounting.assets.categories.seedDone')}
            />
          ) : null}
          <DataTable
            columns={columns}
            rows={data.categories}
            getRowId={(r) => r.id}
            caption={t('s15Accounting.assets.categories.title')}
            empty={<EmptyState title={t('s15Accounting.assets.categories.empty')} />}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.assets.categories.addTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/accounting/assets/categories"
                resetAfter
                submitLabel={t('s15Accounting.common.save')}
                doneText={t('s15Accounting.assets.done')}
                fields={[
                  {
                    name: 'name',
                    label: t('s15Accounting.assets.categories.name'),
                    required: true,
                  },
                  {
                    name: 'method',
                    label: t('s15Accounting.assets.categories.method'),
                    kind: 'select',
                    initial: 'straight_line',
                    options: METHODS.map((m) => ({
                      value: m,
                      label: t(`s15Accounting.assets.methods.${m}` as StringKey),
                    })),
                  },
                  {
                    name: 'lifeMonths',
                    label: t('s15Accounting.assets.categories.lifeMonths'),
                    whole: true,
                    initial: '60',
                  },
                  pick(
                    t('s15Accounting.assets.categories.assetAccount'),
                    'assetAccountId',
                    (a) => a.type === 'asset' && !a.contra,
                  ),
                  pick(
                    t('s15Accounting.assets.categories.accumulatedAccount'),
                    'accumulatedAccountId',
                    (a) => a.type === 'asset' && a.contra,
                  ),
                  pick(
                    t('s15Accounting.assets.categories.expenseAccount'),
                    'expenseAccountId',
                    (a) => a.type === 'expense',
                  ),
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
