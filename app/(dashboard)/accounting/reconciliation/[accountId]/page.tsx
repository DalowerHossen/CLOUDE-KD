// path: app/(dashboard)/accounting/reconciliation/[accountId]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { BankLineActions } from '@/components/accounting/bank-line-actions';
import { StatementImportForm } from '@/components/accounting/statement-import-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { getBankAccount, type BankAccountView } from '@/services/reconciliation/bank-accounts';
import { unmatchedQueue, type TxnWithSuggestions } from '@/services/reconciliation/matching';
import type { BankRule } from '@/services/reconciliation/matching-rules';
import {
  openReconciliation,
  reconciliationHistory,
  reconciliationState,
  type ReconciliationState,
  type ReconciliationView,
} from '@/services/reconciliation/reconcile';
import { listRules } from '@/services/reconciliation/rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bank reconciliation' };

export default async function BankAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'bank_account');
  const { accountId } = await params;
  if (!z.string().uuid().safeParse(accountId).success) notFound();
  const companyId = actor.companyId as string;
  const canReconcile = await getService('permissions').can(actor, 'accounting.reconcile', {
    type: 'bank_account',
  });
  let data: {
    bank: BankAccountView;
    queue: TxnWithSuggestions[];
    open: ReconciliationState | null;
    history: ReconciliationView[];
    rules: BankRule[];
    accounts: { id: string; label: string }[];
  } | null;
  try {
    const bank = await getBankAccount(companyId, accountId);
    const [queue, openRec, history, rules, accounts] = await Promise.all([
      unmatchedQueue(companyId, accountId),
      openReconciliation(companyId, accountId),
      reconciliationHistory(companyId, accountId),
      listRules(companyId),
      listAccounts(companyId, { status: 'active' }),
    ]);
    data = {
      bank,
      queue,
      open: openRec ? await reconciliationState(companyId, openRec.id) : null,
      history,
      rules,
      accounts: accounts
        .filter((a) => a.allowPosting && a.id !== bank.ledgerAccountId)
        .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })),
    };
  } catch {
    data = null;
  }
  if (data === null) return <ErrorState description={t('s15Accounting.common.loadError')} />;
  const today = new Date().toISOString().slice(0, 10);
  const open = data.open;
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={data.bank.name}
        description={`${data.bank.bankName}${data.bank.last4 ? ` ...${data.bank.last4}` : ''}`}
      />
      {canReconcile ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s15Accounting.reconciliation.importTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <StatementImportForm bankAccountId={data.bank.id} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Accounting.reconciliation.queueTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          {canReconcile && data.queue.length > 0 ? (
            <ActionButton
              endpoint="/api/accounting/reconciliation/auto-match"
              body={{ bankAccountId: data.bank.id }}
              variant="default"
              label={t('s15Accounting.reconciliation.autoMatch')}
              doneText={t('s15Accounting.reconciliation.autoMatched')}
            />
          ) : null}
          {data.queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('s15Accounting.reconciliation.queueEmpty')}
            </p>
          ) : (
            <ul className="space-y-sp-12">
              {data.queue.map(({ txn, suggestions }) => {
                const best = suggestions[0];
                return (
                  <li key={txn.id} className="rounded-md border p-sp-8 text-sm">
                    <p className="font-medium">
                      {txn.date} | {txn.amount} USD | {txn.description || txn.reference}
                    </p>
                    {best ? (
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">
                          {t('s15Accounting.reconciliation.columns.suggestion')}: {best.entryNumber}{' '}
                          {best.memo} ({best.date}, {t('s15Accounting.reconciliation.score')}{' '}
                          {best.score})
                        </span>
                        {canReconcile ? (
                          <ActionButton
                            endpoint={`/api/accounting/reconciliation/transactions/${txn.id}/confirm`}
                            body={{ lineIds: [best.lineId] }}
                            variant="default"
                            label={t('s15Accounting.reconciliation.confirm')}
                            doneText={t('s15Accounting.reconciliation.matchedDone')}
                          />
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        {t('s15Accounting.reconciliation.noSuggestion')}
                      </p>
                    )}
                    {canReconcile ? (
                      <BankLineActions txnId={txn.id} accounts={data.accounts} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Accounting.reconciliation.reconcileTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          {open ? (
            <>
              <Badge variant="outline">
                {t('s15Accounting.reconciliation.inProgress')}: {open.reconciliation.statementDate}
              </Badge>
              <dl className="grid gap-sp-12 sm:grid-cols-3">
                {(
                  [
                    [
                      t('s15Accounting.reconciliation.statementBalance'),
                      open.reconciliation.statementBalance,
                    ],
                    [t('s15Accounting.reconciliation.opening'), open.reconciliation.openingBalance],
                    [t('s15Accounting.reconciliation.lines'), String(open.lines)],
                    [t('s15Accounting.reconciliation.unmatchedLines'), String(open.unmatched)],
                    [t('s15Accounting.reconciliation.expected'), open.expected],
                    [t('s15Accounting.reconciliation.cleared'), open.clearedTotal],
                    [t('s15Accounting.reconciliation.difference'), open.difference],
                    [t('s15Accounting.reconciliation.ledgerBalance'), open.book.ledgerBalance],
                    [t('s15Accounting.reconciliation.notShown'), open.book.notShownByBank],
                    [t('s15Accounting.reconciliation.discrepancy'), open.book.discrepancy],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {open.unmatched > 0 || open.difference !== '0.0000' ? (
                <Alert>{t('s15Accounting.reconciliation.mustBeZero')}</Alert>
              ) : null}
              {canReconcile && open.unmatched === 0 && open.difference === '0.0000' ? (
                <JsonForm
                  endpoint={`/api/accounting/reconciliation/${open.reconciliation.id}/complete`}
                  idempotent
                  submitLabel={t('s15Accounting.reconciliation.complete')}
                  doneText={t('s15Accounting.reconciliation.completed')}
                  fields={[{ name: 'note', label: t('s15Accounting.reconciliation.note') }]}
                />
              ) : null}
            </>
          ) : canReconcile ? (
            <JsonForm
              endpoint="/api/accounting/reconciliation"
              idempotent
              fixed={{ bankAccountId: data.bank.id }}
              submitLabel={t('s15Accounting.reconciliation.start')}
              doneText={t('s15Accounting.reconciliation.started')}
              fields={[
                {
                  name: 'statementDate',
                  label: t('s15Accounting.reconciliation.statementDate'),
                  initial: today,
                  required: true,
                },
                {
                  name: 'statementBalance',
                  label: t('s15Accounting.reconciliation.statementBalance'),
                  required: true,
                },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Accounting.reconciliation.historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                <span>{h.statementDate}</span>
                <span>{h.statementBalance} USD</span>
                <Badge variant="outline">
                  {h.status === 'completed'
                    ? t('s15Accounting.reconciliation.completed')
                    : t('s15Accounting.reconciliation.inProgress')}
                </Badge>
                {(['csv', 'pdf'] as const).map((f) => (
                  <Button key={f} asChild size="sm" variant="outline">
                    <a href={`/api/accounting/reconciliation/${h.id}/report?format=${f}`}>
                      {t('s15Accounting.reconciliation.report')} {f.toUpperCase()}
                    </a>
                  </Button>
                ))}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Accounting.reconciliation.rulesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-sp-12">
          <p className="text-sm text-muted-foreground">
            {t('s15Accounting.reconciliation.rulesHelp')}
          </p>
          <ul className="space-y-1 text-sm">
            {data.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">
                  &quot;{r.containsText}&quot; |{' '}
                  {t(`s15Accounting.reconciliation.directions.${r.direction}` as StringKey)} |{' '}
                  {data.accounts.find((a) => a.id === r.accountId)?.label ?? ''}
                </span>
                {canReconcile ? (
                  <ActionButton
                    endpoint={`/api/accounting/reconciliation/rules/${r.id}`}
                    method="PATCH"
                    body={{ status: r.status === 'active' ? 'inactive' : 'active' }}
                    label={
                      r.status === 'active'
                        ? t('s15Accounting.reconciliation.off')
                        : t('s15Accounting.reconciliation.on')
                    }
                    doneText={t('s15Accounting.common.done')}
                  />
                ) : null}
                {canReconcile ? (
                  <ActionButton
                    endpoint={`/api/accounting/reconciliation/rules/${r.id}`}
                    method="DELETE"
                    label={t('s15Accounting.reconciliation.remove')}
                    doneText={t('s15Accounting.common.done')}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {canReconcile ? (
            <JsonForm
              endpoint="/api/accounting/reconciliation/rules"
              resetAfter
              submitLabel={t('s15Accounting.common.save')}
              doneText={t('s15Accounting.reconciliation.ruleCreated')}
              fixed={{ bankAccountId: data.bank.id }}
              fields={[
                { name: 'name', label: t('s15Accounting.reconciliation.ruleName'), required: true },
                {
                  name: 'containsText',
                  label: t('s15Accounting.reconciliation.ruleText'),
                  required: true,
                },
                {
                  name: 'direction',
                  label: t('s15Accounting.reconciliation.ruleDirection'),
                  kind: 'select',
                  initial: 'any',
                  options: (['any', 'in', 'out'] as const).map((d) => ({
                    value: d,
                    label: t(`s15Accounting.reconciliation.directions.${d}` as StringKey),
                  })),
                },
                {
                  name: 'accountId',
                  label: t('s15Accounting.reconciliation.ruleAccount'),
                  kind: 'select',
                  initial: data.accounts[0]?.id ?? '',
                  options: data.accounts.map((a) => ({ value: a.id, label: a.label })),
                },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
