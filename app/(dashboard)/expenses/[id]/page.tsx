// path: app/(dashboard)/expenses/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getExpense, type ExpenseDetail } from '@/services/expense/expenses';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Expense' };

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('expense.read', 'tenant', 'expense');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const perms = getService('permissions');
  const [canApprove, canManage] = await Promise.all([
    perms.can(actor, 'expense.approve', { type: 'expense' }),
    perms.can(actor, 'expense.manage', { type: 'expense' }),
  ]);
  let e: ExpenseDetail;
  try {
    e = await getExpense(actor, id);
  } catch {
    notFound();
  }
  const fields: [string, string][] = [
    [t('s15Expenses.detail.submittedBy'), e.submitterName],
    [t('s15Expenses.detail.category'), e.categoryName],
    [t('s15Expenses.detail.net'), e.amountNet],
    [t('s15Expenses.detail.tax'), e.taxAmount],
    [t('s15Expenses.detail.total'), `${e.total} USD`],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={`${e.vendor || e.description || t('s15Expenses.detail.title')} | ${e.expenseDate}`}
        description={e.description}
        actions={
          <>
            <Badge variant="outline">
              {t(`s15Expenses.list.statuses.${e.status}` as StringKey)}
            </Badge>
            <Badge variant="outline">
              {t(`s15Expenses.list.payments.${e.paymentStatus}` as StringKey)}
            </Badge>
          </>
        }
      />
      <Card>
        <CardContent className="pt-sp-16">
          <dl className="grid gap-sp-12 sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {e.reimbursable ? (
            <p className="mt-sp-8 text-sm">{t('s15Expenses.detail.reimbursable')}</p>
          ) : null}
          {e.paidAt ? (
            <p className="mt-sp-8 text-sm">
              {t('s15Expenses.detail.paidOn')} {e.paidAt.slice(0, 10)}
              {e.paidVia ? ` (${e.paidVia})` : ''}
            </p>
          ) : null}
          {e.duplicateOf ? (
            <p className="mt-sp-8 text-sm">
              {t('s15Expenses.detail.duplicateOf')}:{' '}
              <Link className="underline" href={`/expenses/${e.duplicateOf}`}>
                {e.duplicateOf.slice(0, 8)}
              </Link>
            </p>
          ) : null}
          {e.rejectReason ? (
            <Alert variant="destructive">
              {t('s15Expenses.detail.rejectReason')}: {e.rejectReason}
            </Alert>
          ) : null}
          {e.overrideReason ? (
            <p className="mt-sp-8 text-sm">
              {t('s15Expenses.detail.override')}: {e.overrideReason}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {e.policyFlags.length > 0 ? (
        <Alert variant="destructive">
          <p className="font-medium">{t('s15Expenses.detail.flags')}</p>
          <ul className="list-disc pl-5 text-sm">
            {e.policyFlags.map((f, i) => (
              <li key={`${f.policyId}-${i}`}>
                {f.policyName}: {f.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Expenses.detail.receipts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {e.receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s15Expenses.detail.noReceipts')}</p>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {e.receipts.map((r) => (
                <li key={r.id}>
                  <a className="underline" href={`/api/expenses/receipts/${r.id}/file`}>
                    {r.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {e.status === 'pending' && canApprove ? (
        <Card>
          <CardContent className="space-y-sp-12 pt-sp-16">
            <JsonForm
              endpoint={`/api/expenses/${e.id}/decide`}
              idempotent
              fixed={{ decision: 'approve' }}
              submitLabel={t('s15Expenses.detail.approve')}
              doneText={t('s15Expenses.common.done')}
              fields={
                e.policyFlags.length > 0
                  ? [
                      {
                        name: 'overrideReason',
                        label: t('s15Expenses.detail.overrideLabel'),
                        required: true,
                      },
                    ]
                  : []
              }
            />
            <JsonForm
              endpoint={`/api/expenses/${e.id}/decide`}
              idempotent
              fixed={{ decision: 'reject' }}
              submitLabel={t('s15Expenses.detail.reject')}
              doneText={t('s15Expenses.common.done')}
              fields={[
                {
                  name: 'reason',
                  label: t('s15Expenses.detail.rejectReasonLabel'),
                  required: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      {e.status === 'approved' && e.paymentStatus === 'unpaid' && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s15Expenses.detail.markPaid')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint={`/api/expenses/${e.id}/paid`}
              idempotent
              submitLabel={t('s15Expenses.detail.markPaid')}
              doneText={t('s15Expenses.common.done')}
              fields={[
                {
                  name: 'paidVia',
                  label: t('s15Expenses.detail.paidVia'),
                  kind: 'select',
                  initial: 'bank',
                  options: (['bank', 'cash', 'card'] as const).map((x) => ({
                    value: x,
                    label: t(`s15Expenses.form.vias.${x}`),
                  })),
                },
                { name: 'reference', label: t('s15Expenses.detail.reference') },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      {e.status !== 'approved' ? (
        <ActionButton
          endpoint={`/api/expenses/${e.id}`}
          method="DELETE"
          variant="destructive"
          label={t('s15Expenses.detail.delete')}
          doneText={t('s15Expenses.detail.deleted')}
        />
      ) : null}
    </div>
  );
}
