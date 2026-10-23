// path: app/(dashboard)/accounting/reconciliation/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { listBankAccounts, type BankAccountView } from '@/services/reconciliation/bank-accounts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bank reconciliation' };

export default async function ReconciliationPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'bank_account');
  const companyId = actor.companyId as string;
  const canReconcile = await getService('permissions').can(actor, 'accounting.reconcile', {
    type: 'bank_account',
  });
  let data: { banks: BankAccountView[]; cash: { id: string; label: string }[] } | null;
  try {
    const [banks, accounts] = await Promise.all([
      listBankAccounts(companyId),
      listAccounts(companyId, { type: 'asset', status: 'active' }),
    ]);
    data = {
      banks,
      cash: accounts
        .filter((a) => a.isCash && a.allowPosting)
        .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.reconciliation.title')}
        description={t('s15Accounting.reconciliation.description')}
      />
      {data === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.reconciliation.accountsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.banks.length === 0 ? (
                <EmptyState title={t('s15Accounting.reconciliation.noAccounts')} />
              ) : (
                <ul className="space-y-1">
                  {data.banks.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        className="font-medium underline"
                        href={`/accounting/reconciliation/${b.id}`}
                      >
                        {b.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {b.bankName}
                        {b.last4 ? ` ...${b.last4}` : ''}
                      </span>
                      {b.status === 'closed' ? (
                        <Badge variant="outline">{t('s15Accounting.reconciliation.closed')}</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {canReconcile ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.reconciliation.newAccount')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint="/api/accounting/reconciliation/accounts"
                  resetAfter
                  submitLabel={t('s15Accounting.common.save')}
                  doneText={t('s15Accounting.reconciliation.accountCreated')}
                  fields={[
                    { name: 'name', label: t('s15Accounting.reconciliation.name'), required: true },
                    { name: 'bankName', label: t('s15Accounting.reconciliation.bankName') },
                    { name: 'last4', label: t('s15Accounting.reconciliation.last4') },
                    {
                      name: 'ledgerAccountId',
                      label: t('s15Accounting.reconciliation.ledger'),
                      kind: 'select',
                      initial: data.cash[0]?.id ?? '',
                      options: data.cash.map((a) => ({ value: a.id, label: a.label })),
                    },
                    {
                      name: 'openingBalance',
                      label: t('s15Accounting.reconciliation.openingBalance'),
                      initial: '0',
                    },
                    {
                      name: 'openingDate',
                      label: t('s15Accounting.reconciliation.openingDate'),
                      hint: 'YYYY-MM-DD',
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
