// path: app/(dashboard)/accounting/entities/page.tsx
import type { Metadata } from 'next';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import type {
  ConsolidatedLine,
  Consolidation,
  EliminationRow,
} from '@/services/budget/consolidation-rules';
import {
  consolidated,
  getGroup,
  joinableCompanies,
  pairAccounts,
  type GroupView,
} from '@/services/budget/entities';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Legal entities' };

const query = z.object({
  kind: z.enum(['profit_loss', 'balance_sheet']).catch('profit_loss'),
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

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.entity.manage', 'tenant', 'entity_group');
  const companyId = actor.companyId as string;
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const today = new Date().toISOString().slice(0, 10);
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  let group: GroupView | null = null;
  let joinable: { id: string; name: string }[] = [];
  let accounts: Awaited<ReturnType<typeof pairAccounts>> = [];
  let result: Consolidation | null = null;
  let message: string | null = null;
  let failed = false;
  try {
    group = await getGroup(companyId);
    if (group) {
      [joinable, accounts] = await Promise.all([
        joinableCompanies(actor),
        pairAccounts(group, companyId),
      ]);
      if (group.members.length > 0) {
        try {
          result = (await consolidated(actor, q.kind, from, to)).result;
        } catch (error) {
          message =
            error instanceof Error && error.name !== 'InternalError'
              ? error.message
              : t('s15Accounting.entities.loadError');
        }
      }
    }
  } catch {
    failed = true;
  }
  const names = new Map<string, string>([
    [companyId, t('s15Accounting.entities.thisCompany')],
    ...(group?.members.map((m) => [m.companyId, m.name] as [string, string]) ?? []),
  ]);
  const accountLabel = (id: string): string => accounts.find((a) => a.id === id)?.label ?? '';
  const companyOptions = [...names].map(([value, label]) => ({ value, label }));
  const isProfit = q.kind === 'profit_loss';
  const types = isProfit ? ['revenue', 'expense'] : ['asset', 'liability', 'equity'];
  const lineColumns: readonly DataColumn<ConsolidatedLine>[] = result
    ? [
        {
          key: 'account',
          header: t('s15Accounting.entities.account'),
          primary: true,
          cell: (r) => `${r.code} ${r.name}`,
        },
        ...result.members.map((m, i) => ({
          key: `m${i}`,
          header: m.name,
          hideOnMobile: true,
          cell: (r: ConsolidatedLine) => (
            <span className="block text-right tabular-nums">{r.byMember[i]}</span>
          ),
        })),
        {
          key: 'elim',
          header: t('s15Accounting.entities.elimination'),
          hideOnMobile: true,
          cell: (r) => <span className="block text-right tabular-nums">{r.elimination}</span>,
        },
        {
          key: 'total',
          header: t('s15Accounting.entities.consolidated'),
          cell: (r) => <span className="block text-right tabular-nums">{r.total}</span>,
        },
      ]
    : [];
  const elimColumns: readonly DataColumn<EliminationRow>[] = [
    {
      key: 'label',
      header: t('s15Accounting.entities.elimColumns.label'),
      primary: true,
      cell: (r) => r.label,
    },
    {
      key: 'a',
      header: t('s15Accounting.entities.elimColumns.a'),
      hideOnMobile: true,
      cell: (r) => r.amountA,
    },
    {
      key: 'b',
      header: t('s15Accounting.entities.elimColumns.b'),
      hideOnMobile: true,
      cell: (r) => r.amountB,
    },
    {
      key: 'e',
      header: t('s15Accounting.entities.elimColumns.eliminated'),
      cell: (r) => r.eliminated,
    },
    {
      key: 'd',
      header: t('s15Accounting.entities.elimColumns.difference'),
      cell: (r) => r.difference,
    },
  ];
  const done = t('s15Accounting.entities.done');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.entities.title')}
        description={t('s15Accounting.entities.description')}
      />
      {failed ? (
        <ErrorState description={t('s15Accounting.entities.loadError')} />
      ) : !group ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s15Accounting.entities.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint="/api/accounting/entities"
              submitLabel={t('s15Accounting.common.save')}
              doneText={done}
              fields={[
                { name: 'name', label: t('s15Accounting.entities.groupName'), required: true },
              ]}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {group.name}: {t('s15Accounting.entities.membersTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <ul className="space-y-1 text-sm">
                <li>{t('s15Accounting.entities.thisCompany')}</li>
                {group.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    {m.name} ({m.ownershipPercent}%)
                    <ActionButton
                      endpoint={`/api/accounting/entities/members/${m.id}`}
                      method="DELETE"
                      label={t('s15Accounting.entities.remove')}
                      doneText={done}
                    />
                  </li>
                ))}
              </ul>
              {joinable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.entities.noCompanies')}
                </p>
              ) : (
                <JsonForm
                  endpoint="/api/accounting/entities/members"
                  submitLabel={t('s15Accounting.entities.addMember')}
                  doneText={done}
                  fields={[
                    {
                      name: 'memberCompanyId',
                      label: t('s15Accounting.entities.company'),
                      kind: 'select',
                      required: true,
                      options: joinable.map((c) => ({ value: c.id, label: c.name })),
                    },
                    {
                      name: 'ownershipPercent',
                      label: t('s15Accounting.entities.share'),
                      initial: '100',
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>
          {group.members.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.entities.pairsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.entities.pairsHelp')}
                </p>
                {group.pairs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.entities.none')}
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {group.pairs.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2">
                        {p.label}: {names.get(p.companyA)} {accountLabel(p.accountA)} /{' '}
                        {names.get(p.companyB)} {accountLabel(p.accountB)}
                        <ActionButton
                          endpoint={`/api/accounting/entities/pairs/${p.id}`}
                          method="DELETE"
                          label={t('s15Accounting.entities.remove')}
                          doneText={done}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {companyOptions.length >= 2 ? (
                  <JsonForm
                    endpoint="/api/accounting/entities/pairs"
                    resetAfter
                    submitLabel={t('s15Accounting.entities.addPair')}
                    doneText={done}
                    fields={[
                      {
                        name: 'label',
                        label: t('s15Accounting.entities.pairLabel'),
                        required: true,
                      },
                      {
                        name: 'companyA',
                        label: t('s15Accounting.entities.companyA'),
                        kind: 'select',
                        required: true,
                        options: companyOptions,
                      },
                      {
                        name: 'accountA',
                        label: t('s15Accounting.entities.accountA'),
                        kind: 'select',
                        required: true,
                        options: accounts.map((a) => ({
                          value: a.id,
                          label: `${a.companyName}: ${a.label}`,
                        })),
                      },
                      {
                        name: 'companyB',
                        label: t('s15Accounting.entities.companyB'),
                        kind: 'select',
                        required: true,
                        options: companyOptions,
                      },
                      {
                        name: 'accountB',
                        label: t('s15Accounting.entities.accountB'),
                        kind: 'select',
                        required: true,
                        options: accounts.map((a) => ({
                          value: a.id,
                          label: `${a.companyName}: ${a.label}`,
                        })),
                      },
                    ]}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          {group.members.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.entities.statementsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-12">
                <form method="get" className="flex flex-wrap items-end gap-sp-8">
                  <div className="space-y-1">
                    <Label htmlFor="en-kind">{t('s15Accounting.entities.kind')}</Label>
                    <NativeSelect id="en-kind" name="kind" defaultValue={q.kind}>
                      {(['profit_loss', 'balance_sheet'] as const).map((k) => (
                        <option key={k} value={k}>
                          {t(`s15Accounting.entities.kinds.${k}` as StringKey)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="en-from">{t('s15Accounting.entities.from')}</Label>
                    <Input id="en-from" name="from" type="date" defaultValue={from} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="en-to">{t('s15Accounting.entities.to')}</Label>
                    <Input id="en-to" name="to" type="date" defaultValue={to} />
                  </div>
                  <Button type="submit">{t('s15Accounting.entities.show')}</Button>
                  {result
                    ? (['csv', 'xlsx', 'pdf'] as const).map((f) => (
                        <Button key={f} asChild variant="outline">
                          <a
                            href={`/api/accounting/entities/statements/${q.kind}/export?format=${f}&from=${from}&to=${to}`}
                          >
                            {t('s15Accounting.entities.download')}{' '}
                            {f === 'csv'
                              ? t('s15Accounting.common.csv')
                              : f === 'xlsx'
                                ? t('s15Accounting.common.excel')
                                : t('s15Accounting.common.pdf')}
                          </a>
                        </Button>
                      ))
                    : null}
                </form>
                {message ? <Alert variant="destructive">{message}</Alert> : null}
                {result ? (
                  <>
                    <DataTable
                      columns={lineColumns}
                      rows={result.lines.filter((l) => types.includes(l.type))}
                      getRowId={(r) => `${r.type}-${r.code}`}
                      caption={t(`s15Accounting.entities.kinds.${q.kind}` as StringKey)}
                      empty={<EmptyState title={t('s15Accounting.common.empty')} />}
                    />
                    <p className="text-sm font-medium">
                      {isProfit
                        ? `${t('s15Accounting.entities.netIncome')}: ${result.netIncome}`
                        : result.balanced
                          ? t('s15Accounting.entities.balanced')
                          : t('s15Accounting.entities.notBalanced')}
                    </p>
                    {result.eliminations.length > 0 ? (
                      <>
                        <h3 className="font-semibold">
                          {t('s15Accounting.entities.eliminations')}
                        </h3>
                        <DataTable
                          columns={elimColumns}
                          rows={result.eliminations}
                          getRowId={(r) => r.label}
                          caption={t('s15Accounting.entities.eliminations')}
                        />
                      </>
                    ) : null}
                    {result.minority.map((m) => (
                      <p key={m.name} className="text-sm text-muted-foreground">
                        {t('s15Accounting.entities.minority')}: {m.name} {m.percent}% = {m.share}
                      </p>
                    ))}
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
