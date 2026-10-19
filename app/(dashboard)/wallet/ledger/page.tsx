// path: app/(dashboard)/wallet/ledger/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { loadStatement, type LedgerLine, type Statement } from '@/services/wallet/statement';
import { getWallet } from '@/services/wallet/wallet-service';
import { CsvButton } from '../_components/csv-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ledger' };

const DAY = 86_400_000;
const isDay = (v: string | undefined): v is string =>
  Boolean(v) && /^\d{4}-\d{2}-\d{2}$/.test(v as string);

const columns: readonly DataColumn<LedgerLine>[] = [
  {
    key: 'date',
    header: t('s14Wallet.ledger.columns.date'),
    primary: true,
    cell: (r) => r.at.slice(0, 16).replace('T', ' '),
  },
  { key: 'reason', header: t('s14Wallet.ledger.columns.reason'), cell: (r) => r.reason },
  {
    key: 'account',
    header: t('s14Wallet.ledger.columns.account'),
    hideOnMobile: true,
    cell: (r) => t(`s14Wallet.ledger.accounts.${r.account}` as StringKey),
  },
  {
    key: 'amount',
    header: t('s14Wallet.ledger.columns.amount'),
    cell: (r) => `USD ${r.amount.toDbString()}`,
  },
];

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('wallet.read', 'tenant', 'wallet');
  const companyId = actor.companyId as string;
  const q = await searchParams;
  const today = new Date();
  const to = isDay(q.to) ? q.to : new Date(today.getTime() + DAY).toISOString().slice(0, 10);
  const from = isDay(q.from)
    ? q.from
    : new Date(today.getTime() - 30 * DAY).toISOString().slice(0, 10);
  let statement: Statement | null = null;
  let failed = false;
  try {
    const wallet = await getWallet(companyId);
    if (wallet && from < to) statement = await loadStatement(companyId, wallet.id, from, to);
  } catch {
    failed = true;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s14Wallet.ledger.pageTitle')}
        description={t('s14Wallet.ledger.pageDescription')}
      />
      <form method="get" className="flex flex-wrap items-end gap-sp-12">
        <div className="space-y-1">
          <Label htmlFor="from">{t('s14Wallet.ledger.from')}</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">{t('s14Wallet.ledger.to')}</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit">{t('s14Wallet.ledger.show')}</Button>
        <CsvButton from={from} to={to} />
      </form>
      {failed ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : statement === null ? (
        <EmptyState title={t('s14Wallet.wallet.noWallet')} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('s14Wallet.ledger.opening')}: USD {statement.opening.available.toDbString()} -{' '}
            {t('s14Wallet.ledger.closing')}: USD {statement.closing.available.toDbString()}
          </p>
          <DataTable
            columns={columns}
            rows={statement.lines}
            getRowId={(r) => r.id}
            caption={t('s14Wallet.ledger.pageTitle')}
            empty={<EmptyState title={t('s14Wallet.ledger.empty')} />}
          />
        </>
      )}
    </div>
  );
}
