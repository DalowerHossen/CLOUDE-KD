// path: app/(dashboard)/expenses/reports/page.tsx
import type { Metadata } from 'next';
import { z } from 'zod';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { ReportResult } from '@/lib/reports/types';
import { requirePagePermission } from '@/services/base/page-guard';
import { EXPENSE_REPORT_KEYS, expenseReport } from '@/services/expense/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Expense reports' };

const query = z.object({
  report: z.enum(EXPENSE_REPORT_KEYS).catch('summary'),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

type Row = Record<string, string> & { __id: string };

export default async function ExpenseReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('expense.read', 'tenant', 'expense');
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const today = new Date().toISOString().slice(0, 10);
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  let table: ReportResult | null = null;
  let message: string | null = null;
  try {
    table = await expenseReport(actor, q.report, from, to);
  } catch (error) {
    message =
      error instanceof Error && error.name !== 'InternalError'
        ? error.message
        : t('s15Expenses.reports.loadError');
  }
  const columns: readonly DataColumn<Row>[] = (table?.columns ?? []).map((c, i) => ({
    key: c.key,
    header: c.label,
    primary: i === 0,
    cell: (r: Row) => (
      <span
        className={
          c.type === 'money' || c.type === 'number' || c.type === 'percent'
            ? 'block text-right tabular-nums'
            : undefined
        }
      >
        {r[c.key] ?? ''}
      </span>
    ),
  }));
  const rows: Row[] = (table?.rows ?? []).map((r, i) => ({ ...r, __id: String(i) }));
  const totals: Row | null = table?.totals ? { ...table.totals, __id: 'total' } : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s15Expenses.reports.title')}
        description={t('s15Expenses.reports.description')}
        actions={
          table ? (
            <>
              {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                <Button key={f} asChild variant="outline">
                  <a
                    href={`/api/expenses/reports/${q.report}/export?format=${f}&from=${from}&to=${to}`}
                  >
                    {t('s15Expenses.common.download')}{' '}
                    {f === 'csv'
                      ? t('s15Expenses.reports.csv')
                      : f === 'xlsx'
                        ? t('s15Expenses.reports.excel')
                        : t('s15Expenses.reports.pdf')}
                  </a>
                </Button>
              ))}
            </>
          ) : null
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-sp-8">
        <div className="space-y-1">
          <Label htmlFor="er-report">{t('s15Expenses.reports.report')}</Label>
          <NativeSelect id="er-report" name="report" defaultValue={q.report}>
            {EXPENSE_REPORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`s15Expenses.reports.names.${k}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="er-from">{t('s15Expenses.common.from')}</Label>
          <Input id="er-from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="er-to">{t('s15Expenses.common.to')}</Label>
          <Input id="er-to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit">{t('s15Expenses.common.apply')}</Button>
      </form>
      {message ? <Alert variant="destructive">{message}</Alert> : null}
      {table ? (
        <>
          {table.notes.map((n) => (
            <p key={n} className="text-sm text-muted-foreground">
              {n}
            </p>
          ))}
          <DataTable
            columns={columns}
            rows={totals ? [...rows, totals] : rows}
            getRowId={(r) => r.__id}
            caption={t(`s15Expenses.reports.names.${q.report}` as StringKey)}
            empty={<EmptyState title={t('s15Expenses.common.empty')} />}
          />
        </>
      ) : null}
    </div>
  );
}
