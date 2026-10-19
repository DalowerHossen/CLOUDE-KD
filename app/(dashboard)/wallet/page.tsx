// path: app/(dashboard)/wallet/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import type { HoldView } from '@/services/mor/holds';
import { listItems, morStatus, type MorStatus } from '@/services/mor/reports';
import type { ItemView } from '@/services/mor/settle';
import { getWallet } from '@/services/wallet/wallet-service';
import { JsonForm } from './_components/json-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Wallet' };

const holdColumns: readonly DataColumn<HoldView>[] = [
  {
    key: 'amount',
    header: t('s14Wallet.wallet.holdColumns.amount'),
    primary: true,
    cell: (r) => `USD ${r.amount}`,
  },
  {
    key: 'releaseAt',
    header: t('s14Wallet.wallet.holdColumns.releaseAt'),
    cell: (r) => r.releaseAt.slice(0, 10),
  },
  {
    key: 'reason',
    header: t('s14Wallet.wallet.holdColumns.reason'),
    hideOnMobile: true,
    cell: (r) => r.reason,
  },
];

const itemColumns: readonly DataColumn<ItemView>[] = [
  {
    key: 'date',
    header: t('s14Wallet.wallet.settledColumns.date'),
    primary: true,
    cell: (r) => r.createdAt.slice(0, 10),
  },
  {
    key: 'gross',
    header: t('s14Wallet.wallet.settledColumns.gross'),
    cell: (r) => `USD ${r.gross}`,
  },
  {
    key: 'fee',
    header: t('s14Wallet.wallet.settledColumns.fee'),
    hideOnMobile: true,
    cell: (r) => `USD ${r.fee}`,
  },
  { key: 'net', header: t('s14Wallet.wallet.settledColumns.net'), cell: (r) => `USD ${r.net}` },
  {
    key: 'status',
    header: t('s14Wallet.wallet.settledColumns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s14Wallet.wallet.itemStatuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'note',
    header: t('s14Wallet.wallet.settledColumns.note'),
    hideOnMobile: true,
    cell: (r) => r.holdReason,
  },
];

export default async function WalletPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('wallet.read', 'tenant', 'wallet');
  const companyId = actor.companyId as string;
  let status: MorStatus | null;
  let items: ItemView[] | null;
  let threshold: string | null = null;
  try {
    [status, items] = await Promise.all([
      morStatus(companyId),
      listItems(companyId, { limit: 20 }),
    ]);
    threshold = (await getWallet(companyId))?.lowBalanceThreshold ?? null;
  } catch {
    status = null;
    items = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s14Wallet.wallet.pageTitle')}
        description={t('s14Wallet.wallet.pageDescription')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/wallet/ledger">{t('s14Wallet.wallet.ledgerLink')}</Link>
            </Button>
            <Button asChild>
              <Link href="/wallet/payouts">{t('s14Wallet.wallet.payoutsLink')}</Link>
            </Button>
          </>
        }
      />
      {status === null || items === null ? (
        <ErrorState description={t('s14Wallet.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardContent className="pt-sp-16">
              <dl className="grid gap-sp-12 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.wallet.available')}</dt>
                  <dd className="text-h2 font-semibold">USD {status.available}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.wallet.held')}</dt>
                  <dd className="text-h2 font-semibold">USD {status.held}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s14Wallet.wallet.reserve')}</dt>
                  <dd className="text-h2 font-semibold">USD {status.reserveHeld}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Alert variant={status.mode === 'suspended' ? 'destructive' : 'default'}>
            <strong>{t('s14Wallet.wallet.modeTitle')}: </strong>
            {t(`s14Wallet.wallet.modes.${status.mode}` as StringKey)}. {status.message}
            {status.suspendedReason ? ` ${status.suspendedReason}` : ''}
          </Alert>
          <section className="space-y-sp-8">
            <h2 className="text-h3 font-semibold">{t('s14Wallet.wallet.holdsTitle')}</h2>
            <DataTable
              columns={holdColumns}
              rows={status.holds}
              getRowId={(r) => r.id}
              caption={t('s14Wallet.wallet.holdsTitle')}
              empty={<EmptyState title={t('s14Wallet.wallet.holdsEmpty')} />}
            />
          </section>
          <section className="space-y-sp-8">
            <h2 className="text-h3 font-semibold">{t('s14Wallet.wallet.settledTitle')}</h2>
            <DataTable
              columns={itemColumns}
              rows={items}
              getRowId={(r) => r.id}
              caption={t('s14Wallet.wallet.settledTitle')}
              empty={<EmptyState title={t('s14Wallet.wallet.settledEmpty')} />}
            />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>{t('s14Wallet.wallet.lowTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('s14Wallet.wallet.lowDescription')}
              </p>
            </CardHeader>
            <CardContent>
              <JsonForm
                endpoint="/api/wallet/threshold"
                method="PUT"
                emptyAsNull
                submitLabel={t('s14Wallet.common.save')}
                doneText={t('s14Wallet.common.saved')}
                fields={[
                  {
                    name: 'threshold',
                    label: t('s14Wallet.wallet.lowLabel'),
                    initial: threshold ?? '',
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
