// path: app/(dashboard)/expenses/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { ExpenseForm } from '@/components/accounting/expense-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { categoryOptions, listCategories, type CategoryView } from '@/services/expense/categories';
import { listExpenses, type ExpenseView } from '@/services/expense/expenses';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Expenses' };

const PAGE = 50;
const query = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional().catch(undefined),
  payment: z.enum(['unpaid', 'paid']).optional().catch(undefined),
  categoryId: z.string().uuid().optional().catch(undefined),
  q: z.string().max(60).optional().catch(undefined),
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
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('expense.read', 'tenant', 'expense');
  const companyId = actor.companyId as string;
  const canCreate = await getService('permissions').can(actor, 'expense.create', {
    type: 'expense',
  });
  const canManage = await getService('permissions').can(actor, 'expense.manage', {
    type: 'expense',
  });
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const page = q.page ?? 1;
  let data: { rows: ExpenseView[]; total: number; categories: CategoryView[] } | null;
  try {
    const [list, categories] = await Promise.all([
      listExpenses(actor, { ...q, limit: PAGE, offset: (page - 1) * PAGE }),
      listCategories(companyId),
    ]);
    data = { ...list, categories };
  } catch {
    data = null;
  }
  const names = new Map((data?.categories ?? []).map((c) => [c.id, c.name]));
  const columns: readonly DataColumn<ExpenseView>[] = [
    {
      key: 'date',
      header: t('s15Expenses.list.columns.date'),
      primary: true,
      cell: (r) => (
        <Link className="underline" href={`/expenses/${r.id}`}>
          {r.expenseDate}
        </Link>
      ),
    },
    {
      key: 'vendor',
      header: t('s15Expenses.list.columns.vendor'),
      cell: (r) => r.vendor || r.description,
    },
    {
      key: 'category',
      header: t('s15Expenses.list.columns.category'),
      hideOnMobile: true,
      cell: (r) => (r.categoryId ? (names.get(r.categoryId) ?? '') : ''),
    },
    { key: 'total', header: t('s15Expenses.list.columns.total'), cell: (r) => r.total },
    {
      key: 'status',
      header: t('s15Expenses.list.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">{t(`s15Expenses.list.statuses.${r.status}` as StringKey)}</Badge>
          {r.policyFlags.length > 0 ? (
            <Badge variant="outline">{t('s15Expenses.list.flagged')}</Badge>
          ) : null}
          {r.duplicateOf ? (
            <Badge variant="outline">{t('s15Expenses.list.duplicate')}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'payment',
      header: t('s15Expenses.list.columns.payment'),
      hideOnMobile: true,
      cell: (r) => t(`s15Expenses.list.payments.${r.paymentStatus}` as StringKey),
    },
  ];
  const keep = (p: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...q, page: p }))
      if (v !== undefined && v !== '') params.set(k, String(v));
    return `/expenses?${params.toString()}`;
  };
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Expenses.list.title')}
        description={t('s15Expenses.list.description')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/expenses/reports">{t('s15Expenses.list.reports')}</Link>
            </Button>
            {canManage ? (
              <Button asChild variant="outline">
                <Link href="/expenses/recurring">{t('s15Expenses.list.recurring')}</Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button asChild variant="outline">
                <Link href="/expenses/settings">{t('s15Expenses.list.settings')}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <form method="get" className="grid gap-sp-8 sm:grid-cols-6">
        <Input
          name="q"
          defaultValue={q.q ?? ''}
          placeholder={t('s15Expenses.list.search')}
          aria-label={t('s15Expenses.list.search')}
          maxLength={60}
          className="sm:col-span-2"
        />
        <Input
          name="from"
          type="date"
          defaultValue={q.from ?? ''}
          aria-label={t('s15Expenses.common.from')}
        />
        <Input
          name="to"
          type="date"
          defaultValue={q.to ?? ''}
          aria-label={t('s15Expenses.common.to')}
        />
        <NativeSelect
          name="status"
          defaultValue={q.status ?? ''}
          aria-label={t('s15Expenses.list.filterStatus')}
        >
          <option value="">{t('s15Expenses.list.all')}</option>
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`s15Expenses.list.statuses.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="payment"
          defaultValue={q.payment ?? ''}
          aria-label={t('s15Expenses.list.filterPayment')}
        >
          <option value="">{t('s15Expenses.list.all')}</option>
          {(['unpaid', 'paid'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`s15Expenses.list.payments.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          {t('s15Expenses.common.apply')}
        </Button>
      </form>
      {data === null ? (
        <ErrorState description={t('s15Expenses.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data.rows}
            getRowId={(r) => r.id}
            caption={t('s15Expenses.list.title')}
            empty={<EmptyState title={t('s15Expenses.list.empty')} />}
          />
          <nav
            className="flex items-center justify-between text-sm"
            aria-label={t('s15Expenses.list.title')}
          >
            {page > 1 ? (
              <Link className="underline" href={keep(page - 1)}>
                {t('s15Expenses.common.back')}
              </Link>
            ) : (
              <span />
            )}
            {page * PAGE < data.total ? (
              <Link className="underline" href={keep(page + 1)}>
                {page + 1}
              </Link>
            ) : (
              <span />
            )}
          </nav>
          {canCreate ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Expenses.form.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ExpenseForm
                  categories={categoryOptions(data.categories)}
                  isOwner={actor.role !== 'staff'}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
