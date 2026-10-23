// path: app/(dashboard)/accounting/accounts/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { CsvImportForm } from '@/components/accounting/csv-import-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  COUNTRY_TEMPLATES,
  INDUSTRIES,
  SUBTYPES_BY_TYPE,
  ACCOUNT_TYPES,
} from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts, type AccountView } from '@/services/accounting/accounts';
import { buildTree, flattenTree } from '@/services/accounting/chart-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Chart of accounts' };

type Row = AccountView & { depth: number };

export default async function AccountsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'account');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'accounting.account.manage', {
    type: 'account',
  });
  let accounts: AccountView[] | null;
  try {
    accounts = await listAccounts(companyId);
  } catch {
    accounts = null;
  }
  const rows: Row[] = accounts
    ? flattenTree(buildTree(accounts.map((a) => ({ ...a, parentId: a.parentId })))).map((n) => ({
        ...n.account,
        depth: n.depth,
      }))
    : [];
  const columns: readonly DataColumn<Row>[] = [
    {
      key: 'code',
      header: t('s15Accounting.accounts.columns.code'),
      primary: true,
      cell: (r) => (
        <span style={{ paddingLeft: `${r.depth * 16}px` }} className="font-mono">
          {r.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: t('s15Accounting.accounts.columns.name'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link className="underline" href={`/accounting/journals?accountId=${r.id}`}>
            {r.name}
          </Link>
          {r.isSystem ? (
            <Badge variant="outline">{t('s15Accounting.accounts.system')}</Badge>
          ) : null}
          {!r.allowPosting ? (
            <Badge variant="outline">{t('s15Accounting.accounts.group')}</Badge>
          ) : null}
          {r.isContra ? (
            <Badge variant="outline">{t('s15Accounting.accounts.contra')}</Badge>
          ) : null}
          {r.isCash ? <Badge variant="outline">{t('s15Accounting.accounts.cash')}</Badge> : null}
        </span>
      ),
    },
    {
      key: 'type',
      header: t('s15Accounting.accounts.columns.type'),
      hideOnMobile: true,
      cell: (r) => t(`s15Accounting.accounts.types.${r.type}` as StringKey),
    },
    {
      key: 'side',
      header: t('s15Accounting.accounts.columns.side'),
      hideOnMobile: true,
      cell: (r) =>
        r.normalSide === 'debit'
          ? t('s15Accounting.common.debit')
          : t('s15Accounting.common.credit'),
    },
    {
      key: 'status',
      header: t('s15Accounting.accounts.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`s15Accounting.accounts.statuses.${r.status}` as StringKey)}
          </Badge>
          {canManage && !r.isSystem ? (
            <ActionButton
              endpoint={`/api/accounting/accounts/${r.id}`}
              method="PATCH"
              body={{ version: r.version, status: r.status === 'active' ? 'inactive' : 'active' }}
              label={
                r.status === 'active'
                  ? t('s15Accounting.accounts.deactivate')
                  : t('s15Accounting.accounts.activate')
              }
              doneText={t('s15Accounting.accounts.done')}
            />
          ) : null}
        </span>
      ),
    },
  ];
  const typeOptions = ACCOUNT_TYPES.map((x) => ({
    value: x,
    label: t(`s15Accounting.accounts.types.${x}` as StringKey),
  }));
  const subtypeOptions = ACCOUNT_TYPES.flatMap((x) =>
    SUBTYPES_BY_TYPE[x].map((s) => ({
      value: s,
      label: `${t(`s15Accounting.accounts.types.${x}` as StringKey)}: ${t(`s15Accounting.accounts.subtypes.${s}` as StringKey)}`,
    })),
  );
  const parentOptions = [
    { value: '', label: t('s15Accounting.accounts.noParent') },
    ...(accounts ?? [])
      .filter((a) => !a.allowPosting)
      .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.accounts.title')}
        description={t('s15Accounting.accounts.description')}
        actions={
          <Button asChild variant="outline">
            <Link prefetch={false} href="/api/accounting/accounts/export">
              {t('s15Accounting.accounts.exportCsv')}
            </Link>
          </Button>
        }
      />
      {accounts === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : accounts.length === 0 ? (
        <>
          <EmptyState title={t('s15Accounting.common.empty')} />
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.accounts.seedTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-8">
                <p className="text-muted-foreground">
                  {t('s15Accounting.accounts.seedDescription')}
                </p>
                <JsonForm
                  endpoint="/api/accounting/accounts/seed"
                  submitLabel={t('s15Accounting.accounts.seed')}
                  doneText={t('s15Accounting.accounts.seeded')}
                  fields={[
                    {
                      name: 'industry',
                      label: t('s15Accounting.accounts.industry'),
                      kind: 'select',
                      initial: 'general',
                      options: INDUSTRIES.map((x) => ({
                        value: x,
                        label: t(`s15Accounting.accounts.industries.${x}` as StringKey),
                      })),
                    },
                    {
                      name: 'template',
                      label: t('s15Accounting.accounts.template'),
                      kind: 'select',
                      initial: 'generic',
                      options: COUNTRY_TEMPLATES.map((x) => ({
                        value: x,
                        label: t(`s15Accounting.accounts.templates.${x}` as StringKey),
                      })),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s15Accounting.accounts.title')}
          empty={<EmptyState title={t('s15Accounting.common.empty')} />}
        />
      )}
      {canManage && accounts && accounts.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.accounts.newTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/accounting/accounts"
                resetAfter
                submitLabel={t('s15Accounting.common.save')}
                doneText={t('s15Accounting.accounts.created')}
                fields={[
                  { name: 'code', label: t('s15Accounting.accounts.number'), required: true },
                  { name: 'name', label: t('s15Accounting.accounts.name'), required: true },
                  {
                    name: 'type',
                    label: t('s15Accounting.accounts.columns.type'),
                    kind: 'select',
                    initial: 'asset',
                    options: typeOptions,
                  },
                  {
                    name: 'subtype',
                    label: t('s15Accounting.accounts.subtype'),
                    kind: 'select',
                    initial: 'current_asset',
                    options: subtypeOptions,
                  },
                  {
                    name: 'parentId',
                    label: t('s15Accounting.accounts.parent'),
                    kind: 'select',
                    initial: '',
                    options: parentOptions,
                  },
                  { name: 'isCash', label: t('s15Accounting.accounts.isCash'), kind: 'checkbox' },
                ]}
                emptyAsNull
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.accounts.importTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CsvImportForm
                endpoint="/api/accounting/accounts/import"
                help={t('s15Accounting.accounts.importHelp')}
                submitLabel={t('s15Accounting.accounts.import')}
                doneText={t('s15Accounting.accounts.imported')}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
