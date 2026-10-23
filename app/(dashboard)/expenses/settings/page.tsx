// path: app/(dashboard)/expenses/settings/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { listCategories, type CategoryView } from '@/services/expense/categories';
import { listPolicies } from '@/services/expense/policies';
import type { Policy } from '@/services/expense/expense-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Expense categories and policies' };

export default async function ExpenseSettingsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('expense.manage', 'tenant', 'expense_category');
  const companyId = actor.companyId as string;
  let data: {
    categories: CategoryView[];
    policies: Policy[];
    accounts: { id: string; label: string }[];
  } | null;
  try {
    const [categories, policies, accounts] = await Promise.all([
      listCategories(companyId),
      listPolicies(companyId),
      listAccounts(companyId, { type: 'expense', status: 'active' }),
    ]);
    data = {
      categories,
      policies,
      accounts: accounts
        .filter((a) => a.allowPosting)
        .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    };
  } catch {
    data = null;
  }
  const accountOptions = [
    { value: '', label: t('s15Expenses.settings.defaultAccount') },
    ...(data?.accounts ?? []).map((a) => ({ value: a.id, label: a.label })),
  ];
  const categoryOptions = (data?.categories ?? []).filter((c) => c.status === 'active');
  const nameOf = (id: string | null): string =>
    data?.categories.find((c) => c.id === id)?.name ?? '';
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Expenses.settings.title')}
        description={t('s15Expenses.settings.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Expenses.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Expenses.settings.categoriesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.categories.length === 0 ? (
                <ActionButton
                  endpoint="/api/expenses/categories/seed"
                  variant="default"
                  label={t('s15Expenses.form.seedCategories')}
                  doneText={t('s15Expenses.common.done')}
                />
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.categories.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {c.parentId ? `${nameOf(c.parentId)} / ` : ''}
                        {c.name}
                      </span>
                      <span className="text-muted-foreground">
                        {data.accounts.find((a) => a.id === c.accountId)?.label ??
                          t('s15Expenses.settings.defaultAccount')}
                      </span>
                      {!c.taxDeductible ? (
                        <Badge variant="outline">{t('s15Expenses.settings.deductible')}: -</Badge>
                      ) : null}
                      <ActionButton
                        endpoint={`/api/expenses/categories/${c.id}`}
                        method="PATCH"
                        body={{
                          version: c.version,
                          status: c.status === 'active' ? 'inactive' : 'active',
                        }}
                        label={
                          c.status === 'active'
                            ? t('s15Expenses.settings.deactivate')
                            : t('s15Expenses.settings.activate')
                        }
                        doneText={t('s15Expenses.common.done')}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="font-semibold">{t('s15Expenses.settings.newCategory')}</h3>
              <JsonForm
                endpoint="/api/expenses/categories"
                resetAfter
                submitLabel={t('s15Expenses.common.save')}
                doneText={t('s15Expenses.settings.categoryCreated')}
                fields={[
                  { name: 'name', label: t('s15Expenses.settings.name'), required: true },
                  {
                    name: 'parentId',
                    label: t('s15Expenses.settings.parent'),
                    kind: 'select',
                    initial: '',
                    options: [
                      { value: '', label: t('s15Expenses.settings.noParent') },
                      ...categoryOptions.map((c) => ({ value: c.id, label: c.name })),
                    ],
                  },
                  {
                    name: 'accountId',
                    label: t('s15Expenses.settings.account'),
                    kind: 'select',
                    initial: '',
                    options: accountOptions,
                  },
                  {
                    name: 'taxDeductible',
                    label: t('s15Expenses.settings.deductible'),
                    kind: 'checkbox',
                    initial: 'true',
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Expenses.settings.policiesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.policies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s15Expenses.settings.noPolicies')}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.policies.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">
                        {p.categoryId
                          ? nameOf(p.categoryId)
                          : t('s15Expenses.settings.anyCategory')}{' '}
                        |{' '}
                        {p.role
                          ? t(`s15Expenses.settings.roles.${p.role}` as StringKey)
                          : t('s15Expenses.settings.anyRole')}{' '}
                        | {t(`s15Expenses.settings.actions.${p.breachAction}` as StringKey)}
                        {p.maxPerExpense ? ` | ${p.maxPerExpense}` : ''}
                        {p.autoApproveBelow ? ` | auto < ${p.autoApproveBelow}` : ''}
                      </span>
                      <ActionButton
                        endpoint={`/api/expenses/policies/${p.id}`}
                        method="PATCH"
                        body={{ status: p.status === 'active' ? 'inactive' : 'active' }}
                        label={
                          p.status === 'active'
                            ? t('s15Expenses.settings.off')
                            : t('s15Expenses.settings.on')
                        }
                        doneText={t('s15Expenses.common.done')}
                      />
                      <ActionButton
                        endpoint={`/api/expenses/policies/${p.id}`}
                        method="DELETE"
                        label={t('s15Expenses.settings.remove')}
                        doneText={t('s15Expenses.common.done')}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="font-semibold">{t('s15Expenses.settings.newPolicy')}</h3>
              <JsonForm
                endpoint="/api/expenses/policies"
                resetAfter
                submitLabel={t('s15Expenses.common.save')}
                doneText={t('s15Expenses.settings.policyCreated')}
                fields={[
                  { name: 'name', label: t('s15Expenses.settings.policyName'), required: true },
                  {
                    name: 'categoryId',
                    label: t('s15Expenses.settings.policyCategory'),
                    kind: 'select',
                    initial: '',
                    options: [
                      { value: '', label: t('s15Expenses.settings.anyCategory') },
                      ...categoryOptions.map((c) => ({ value: c.id, label: c.name })),
                    ],
                  },
                  {
                    name: 'role',
                    label: t('s15Expenses.settings.policyRole'),
                    kind: 'select',
                    initial: '',
                    options: [
                      { value: '', label: t('s15Expenses.settings.anyRole') },
                      { value: 'owner', label: t('s15Expenses.settings.roles.owner') },
                      { value: 'staff', label: t('s15Expenses.settings.roles.staff') },
                    ],
                  },
                  { name: 'maxPerExpense', label: t('s15Expenses.settings.maxExpense') },
                  { name: 'maxPerDay', label: t('s15Expenses.settings.maxDay') },
                  { name: 'maxPerMonth', label: t('s15Expenses.settings.maxMonth') },
                  { name: 'receiptRequiredAbove', label: t('s15Expenses.settings.receiptAbove') },
                  { name: 'autoApproveBelow', label: t('s15Expenses.settings.autoBelow') },
                  {
                    name: 'breachAction',
                    label: t('s15Expenses.settings.action'),
                    kind: 'select',
                    initial: 'flag',
                    options: [
                      { value: 'flag', label: t('s15Expenses.settings.actions.flag') },
                      { value: 'block', label: t('s15Expenses.settings.actions.block') },
                    ],
                  },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
