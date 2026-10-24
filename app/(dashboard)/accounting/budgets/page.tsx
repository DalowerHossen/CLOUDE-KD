// path: app/(dashboard)/accounting/budgets/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { PERIOD_KINDS } from '@/services/budget/budget-rules';
import { listBudgets, type BudgetView } from '@/services/budget/budgets';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Budgets' };

export default async function BudgetsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'budget');
  const canEdit = await getService('permissions').can(actor, 'accounting.budget.edit', {
    type: 'budget',
  });
  let rows: BudgetView[] | null;
  try {
    rows = await listBudgets(actor.companyId as string);
  } catch {
    rows = null;
  }
  const year = `${new Date().toISOString().slice(0, 4)}-01-01`;
  const columns: readonly DataColumn<BudgetView>[] = [
    {
      key: 'name',
      header: t('s15Accounting.budgets.columns.name'),
      primary: true,
      cell: (r) => (
        <Link
          href={`/accounting/budgets/${r.id}`}
          prefetch={false}
          className="font-medium underline"
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: 'year',
      header: t('s15Accounting.budgets.columns.year'),
      cell: (r) => r.fiscalYearStart,
    },
    {
      key: 'rev',
      header: t('s15Accounting.budgets.columns.revision'),
      hideOnMobile: true,
      cell: (r) => String(r.revision),
    },
    {
      key: 'status',
      header: t('s15Accounting.budgets.columns.status'),
      cell: (r) => (
        <Badge variant="outline">
          {t(`s15Accounting.budgets.statuses.${r.status}` as StringKey)}
        </Badge>
      ),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.budgets.title')}
        description={t('s15Accounting.budgets.description')}
      />
      {rows === null ? (
        <ErrorState description={t('s15Accounting.budgets.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            caption={t('s15Accounting.budgets.title')}
            empty={<EmptyState title={t('s15Accounting.budgets.empty')} />}
          />
          {canEdit ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.budgets.newTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint="/api/accounting/budgets"
                    idempotent
                    resetAfter
                    submitLabel={t('s15Accounting.common.save')}
                    doneText={t('s15Accounting.budgets.done')}
                    fields={[
                      {
                        name: 'name',
                        label: t('s15Accounting.budgets.fields.name'),
                        required: true,
                      },
                      {
                        name: 'fiscalYearStart',
                        label: t('s15Accounting.budgets.fields.year'),
                        initial: year,
                        hint: t('s15Accounting.assets.fields.dateHint'),
                        required: true,
                      },
                      {
                        name: 'periodKind',
                        label: t('s15Accounting.budgets.fields.kind'),
                        kind: 'select',
                        initial: 'monthly',
                        options: PERIOD_KINDS.map((k) => ({
                          value: k,
                          label: t(`s15Accounting.budgets.kinds.${k}` as StringKey),
                        })),
                      },
                      { name: 'note', label: t('s15Accounting.budgets.fields.note') },
                    ]}
                  />
                </CardContent>
              </Card>
              {rows.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('s15Accounting.budgets.copyTitle')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-sp-12">
                    <p className="text-sm text-muted-foreground">
                      {t('s15Accounting.budgets.copyHelp')}
                    </p>
                    <JsonForm
                      endpoint="/api/accounting/budgets/copy"
                      idempotent
                      resetAfter
                      submitLabel={t('s15Accounting.budgets.copyButton')}
                      doneText={t('s15Accounting.budgets.done')}
                      fields={[
                        {
                          name: 'sourceBudgetId',
                          label: t('s15Accounting.budgets.fields.source'),
                          kind: 'select',
                          required: true,
                          options: rows.map((r) => ({
                            value: r.id,
                            label: `${r.name} (${r.fiscalYearStart.slice(0, 4)}, ${t(`s15Accounting.budgets.statuses.${r.status}` as StringKey)})`,
                          })),
                        },
                        {
                          name: 'name',
                          label: t('s15Accounting.budgets.fields.name'),
                          required: true,
                        },
                        {
                          name: 'fiscalYearStart',
                          label: t('s15Accounting.budgets.fields.year'),
                          hint: t('s15Accounting.assets.fields.dateHint'),
                          required: true,
                        },
                        {
                          name: 'adjustPercent',
                          label: t('s15Accounting.budgets.fields.percent'),
                          initial: '0',
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
