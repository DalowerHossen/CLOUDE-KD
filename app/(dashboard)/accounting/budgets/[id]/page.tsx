// path: app/(dashboard)/accounting/budgets/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { requirePagePermission } from '@/services/base/page-guard';
import { monthsOf, type BudgetAccount, type VarianceRow } from '@/services/budget/budget-rules';
import { budgetAccounts, cellsOf, getBudget, type BudgetView } from '@/services/budget/budgets';
import { budgetVariance, type VarianceResult } from '@/services/budget/variance';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Budget' };

interface GridRow {
  id: string;
  label: string;
  type: 'revenue' | 'expense';
  total: string;
  months: string[];
}

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'budget');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const raw = await searchParams;
  const through = z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/)
    .optional()
    .catch(undefined)
    .parse(Array.isArray(raw.through) ? raw.through[0] : raw.through);
  const companyId = actor.companyId as string;
  const permissions = getService('permissions');
  const canEdit = await permissions.can(actor, 'accounting.budget.edit', { type: 'budget' });
  const canManage = await permissions.can(actor, 'accounting.budget.manage', { type: 'budget' });
  let data: {
    budget: BudgetView;
    accounts: BudgetAccount[];
    grid: GridRow[];
    variance: VarianceResult | null;
  } | null;
  try {
    const [budget, accounts, cells] = await Promise.all([
      getBudget(companyId, id),
      budgetAccounts(companyId),
      cellsOf(companyId, id),
    ]);
    const months = monthsOf(budget.fiscalYearStart);
    const grid: GridRow[] = accounts
      .filter((a) => cells.some((c) => c.accountId === a.id))
      .map((a) => {
        const per = months.map(
          (m) => cells.find((c) => c.accountId === a.id && c.month === m)?.amount ?? '0.0000',
        );
        return {
          id: a.id,
          label: `${a.code} ${a.name}`,
          type: a.type,
          months: per,
          total: Money.sum(per.map((v) => Money.parse(v))).toDbString(),
        };
      });
    const variance =
      budget.status === 'draft' || cells.length === 0
        ? null
        : await budgetVariance(companyId, id, through).catch(() => null);
    data = { budget, accounts, grid, variance };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  const b = data?.budget;
  const gridColumns: readonly DataColumn<GridRow>[] = [
    {
      key: 'account',
      header: t('s15Accounting.budgets.detail.account'),
      primary: true,
      cell: (r) => r.label,
    },
    {
      key: 'total',
      header: t('s15Accounting.budgets.detail.total'),
      cell: (r) => <span className="block text-right tabular-nums">{r.total}</span>,
    },
    {
      key: 'months',
      header: monthsOf(b?.fiscalYearStart ?? '2026-01-01')
        .map((m) => m.slice(5, 7))
        .join(' / '),
      hideOnMobile: true,
      cell: (r) => (
        <span className="tabular-nums text-xs text-muted-foreground">
          {r.months.map((v) => Money.parse(v).toParts(0).integer).join(' / ')}
        </span>
      ),
    },
  ];
  const v = data?.variance;
  const varianceColumns: readonly DataColumn<VarianceRow>[] = [
    {
      key: 'account',
      header: t('s15Accounting.budgets.detail.columns.account'),
      primary: true,
      cell: (r) => `${r.code} ${r.name}`,
    },
    {
      key: 'budget',
      header: t('s15Accounting.budgets.detail.columns.budget'),
      cell: (r) => <span className="block text-right tabular-nums">{r.budget}</span>,
    },
    {
      key: 'actual',
      header: t('s15Accounting.budgets.detail.columns.actual'),
      cell: (r) => <span className="block text-right tabular-nums">{r.actual}</span>,
    },
    {
      key: 'variance',
      header: t('s15Accounting.budgets.detail.columns.variance'),
      cell: (r) => <span className="block text-right tabular-nums">{r.variance}</span>,
    },
    {
      key: 'used',
      header: t('s15Accounting.budgets.detail.columns.used'),
      hideOnMobile: true,
      cell: (r) => (r.usedPercent ? `${r.usedPercent}%` : '-'),
    },
    {
      key: 'flag',
      header: t('s15Accounting.budgets.detail.columns.flag'),
      cell: (r) =>
        r.level === 100 ? (
          <Badge variant="destructive">{t('s15Accounting.budgets.detail.over')}</Badge>
        ) : r.level === 80 ? (
          <Badge variant="outline">{t('s15Accounting.budgets.detail.watch')}</Badge>
        ) : null,
    },
  ];
  const done = t('s15Accounting.budgets.done');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={b?.name ?? t('s15Accounting.budgets.title')}
        description={
          b
            ? `${b.fiscalYearStart} - ${t(`s15Accounting.budgets.statuses.${b.status}` as StringKey)}`
            : undefined
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/accounting/budgets" prefetch={false}>
              {t('s15Accounting.budgets.detail.back')}
            </Link>
          </Button>
        }
      />
      {data === null || !b ? (
        <ErrorState description={t('s15Accounting.budgets.loadError')} />
      ) : (
        <>
          <div className="flex flex-wrap gap-sp-8">
            {b.status === 'draft' && canEdit ? (
              <>
                <ActionButton
                  endpoint={`/api/accounting/budgets/${id}/submit`}
                  variant="default"
                  label={t('s15Accounting.budgets.detail.submit')}
                  doneText={t('s15Accounting.budgets.detail.submitted')}
                />
                <ActionButton
                  endpoint={`/api/accounting/budgets/${id}`}
                  method="DELETE"
                  variant="destructive"
                  label={t('s15Accounting.budgets.detail.remove')}
                  doneText={t('s15Accounting.budgets.detail.removed')}
                />
              </>
            ) : null}
            {b.status === 'pending_approval' && canManage ? (
              <>
                <ActionButton
                  endpoint={`/api/accounting/budgets/${id}/decide`}
                  body={{ decision: 'approve' }}
                  variant="default"
                  label={t('s15Accounting.budgets.detail.approve')}
                  doneText={t('s15Accounting.budgets.detail.decided')}
                />
                <ActionButton
                  endpoint={`/api/accounting/budgets/${id}/decide`}
                  body={{ decision: 'reject', reason: 'Sent back to draft' }}
                  label={t('s15Accounting.budgets.detail.reject')}
                  doneText={t('s15Accounting.budgets.detail.decided')}
                />
              </>
            ) : null}
            {b.status === 'approved' && canManage ? (
              <>
                <ActionButton
                  endpoint={`/api/accounting/budgets/${id}/revise`}
                  label={t('s15Accounting.budgets.detail.revise')}
                  doneText={done}
                />
                <ActionButton
                  endpoint={`/api/accounting/budgets/${id}/lock`}
                  label={t('s15Accounting.budgets.detail.lock')}
                  doneText={done}
                />
              </>
            ) : null}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.budgets.detail.gridTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={gridColumns}
                rows={data.grid}
                getRowId={(r) => r.id}
                caption={t('s15Accounting.budgets.detail.gridTitle')}
                empty={<EmptyState title={t('s15Accounting.budgets.detail.gridEmpty')} />}
              />
            </CardContent>
          </Card>
          {b.status === 'draft' && canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.budgets.detail.addTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.budgets.detail.addHelp')}{' '}
                  {t(`s15Accounting.budgets.kinds.${b.periodKind}` as StringKey)}.
                </p>
                <JsonForm
                  endpoint={`/api/accounting/budgets/${id}/lines`}
                  submitLabel={t('s15Accounting.common.save')}
                  doneText={done}
                  fields={[
                    {
                      name: 'accountId',
                      label: t('s15Accounting.budgets.fields.account'),
                      kind: 'select',
                      required: true,
                      options: data.accounts.map((a) => ({
                        value: a.id,
                        label: `${a.code} ${a.name} (${t(`s15Accounting.budgets.detail.${a.type}` as StringKey)})`,
                      })),
                    },
                    {
                      name: 'amounts',
                      label: t('s15Accounting.budgets.fields.amounts'),
                      list: true,
                      required: true,
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          {v ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.budgets.detail.varianceTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <form method="get" className="flex flex-wrap items-end gap-sp-8">
                  <div className="space-y-1">
                    <Label htmlFor="bv-through">{t('s15Accounting.budgets.fields.through')}</Label>
                    <Input id="bv-through" name="through" type="date" defaultValue={v.through} />
                  </div>
                  <Button type="submit">{t('s15Accounting.common.apply')}</Button>
                  {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                    <Button key={f} asChild variant="outline">
                      <a
                        href={`/api/accounting/budgets/${id}/variance/export?format=${f}&through=${v.through}`}
                      >
                        {t('s15Accounting.common.download')}{' '}
                        {f === 'csv'
                          ? t('s15Accounting.common.csv')
                          : f === 'xlsx'
                            ? t('s15Accounting.common.excel')
                            : t('s15Accounting.common.pdf')}
                      </a>
                    </Button>
                  ))}
                </form>
                <DataTable
                  columns={varianceColumns}
                  rows={v.report.rows}
                  getRowId={(r) => r.accountId}
                  caption={t('s15Accounting.budgets.detail.varianceTitle')}
                  empty={<EmptyState title={t('s15Accounting.budgets.detail.varianceEmpty')} />}
                />
                <p className="text-sm">
                  {t('s15Accounting.budgets.detail.result')}: {v.report.resultBudget} /{' '}
                  {v.report.resultActual}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.budgets.detail.projection')} {v.revenueProjection.projectedYear}{' '}
                  {t('s15Accounting.budgets.detail.projectionExpenses')}{' '}
                  {v.expenseProjection.projectedYear} {t('s15Accounting.budgets.detail.against')}{' '}
                  {v.revenueProjection.budgetYear} / {v.expenseProjection.budgetYear}.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
