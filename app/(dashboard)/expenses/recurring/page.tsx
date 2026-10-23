// path: app/(dashboard)/expenses/recurring/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listCategories, type CategoryView } from '@/services/expense/categories';
import { listRecurringExpenses, type RecurringExpenseView } from '@/services/expense/recurring';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recurring expenses' };

export default async function RecurringExpensesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('expense.manage', 'tenant', 'recurring_expense');
  const companyId = actor.companyId as string;
  let data: { rows: RecurringExpenseView[]; categories: CategoryView[] } | null;
  try {
    const [rows, categories] = await Promise.all([
      listRecurringExpenses(companyId),
      listCategories(companyId),
    ]);
    data = { rows, categories };
  } catch {
    data = null;
  }
  const columns: readonly DataColumn<RecurringExpenseView>[] = [
    {
      key: 'name',
      header: t('s15Expenses.recurring.columns.name'),
      primary: true,
      cell: (r) => (
        <span>
          {r.name}
          {r.lastError ? (
            <Alert variant="destructive">
              {t('s15Expenses.recurring.lastError')}: {r.lastError}
            </Alert>
          ) : null}
        </span>
      ),
    },
    { key: 'amount', header: t('s15Expenses.recurring.columns.amount'), cell: (r) => r.amountNet },
    {
      key: 'freq',
      header: t('s15Expenses.recurring.columns.frequency'),
      hideOnMobile: true,
      cell: (r) => t(`s15Expenses.recurring.frequencies.${r.frequency}` as StringKey),
    },
    { key: 'next', header: t('s15Expenses.recurring.columns.next'), cell: (r) => r.nextRun },
    {
      key: 'runs',
      header: t('s15Expenses.recurring.columns.runs'),
      hideOnMobile: true,
      cell: (r) => String(r.runCount),
    },
    {
      key: 'status',
      header: t('s15Expenses.recurring.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`s15Expenses.recurring.statuses.${r.status}` as StringKey)}
          </Badge>
          {r.status !== 'finished' ? (
            <ActionButton
              endpoint={`/api/expenses/recurring/${r.id}`}
              method="PATCH"
              body={{ status: r.status === 'active' ? 'paused' : 'active' }}
              label={
                r.status === 'active'
                  ? t('s15Expenses.recurring.pause')
                  : t('s15Expenses.recurring.resume')
              }
              doneText={t('s15Expenses.common.done')}
            />
          ) : null}
          <ActionButton
            endpoint={`/api/expenses/recurring/${r.id}`}
            method="DELETE"
            label={t('s15Expenses.recurring.remove')}
            doneText={t('s15Expenses.common.done')}
          />
        </span>
      ),
    },
  ];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Expenses.recurring.title')}
        description={t('s15Expenses.recurring.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Expenses.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data.rows}
            getRowId={(r) => r.id}
            caption={t('s15Expenses.recurring.title')}
            empty={<EmptyState title={t('s15Expenses.recurring.empty')} />}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Expenses.recurring.new')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/expenses/recurring"
                resetAfter
                submitLabel={t('s15Expenses.common.save')}
                doneText={t('s15Expenses.recurring.created')}
                fields={[
                  { name: 'name', label: t('s15Expenses.recurring.name'), required: true },
                  {
                    name: 'categoryId',
                    label: t('s15Expenses.recurring.category'),
                    kind: 'select',
                    initial: '',
                    options: [
                      { value: '', label: '-' },
                      ...data.categories
                        .filter((c) => c.status === 'active')
                        .map((c) => ({ value: c.id, label: c.name })),
                    ],
                  },
                  { name: 'vendor', label: t('s15Expenses.recurring.vendor') },
                  { name: 'amountNet', label: t('s15Expenses.recurring.net'), required: true },
                  { name: 'taxAmount', label: t('s15Expenses.recurring.tax'), initial: '0' },
                  {
                    name: 'frequency',
                    label: t('s15Expenses.recurring.frequency'),
                    kind: 'select',
                    initial: 'monthly',
                    options: (['monthly', 'quarterly', 'yearly'] as const).map((f) => ({
                      value: f,
                      label: t(`s15Expenses.recurring.frequencies.${f}` as StringKey),
                    })),
                  },
                  {
                    name: 'dayOfMonth',
                    label: t('s15Expenses.recurring.day'),
                    whole: true,
                    initial: '1',
                  },
                  {
                    name: 'firstRun',
                    label: t('s15Expenses.recurring.firstRun'),
                    initial: today,
                    required: true,
                  },
                  { name: 'endDate', label: t('s15Expenses.recurring.endDate') },
                  { name: 'paid', label: t('s15Expenses.recurring.paid'), kind: 'checkbox' },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
