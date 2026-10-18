// path: app/(dashboard)/disputes/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  disputeStats,
  listDisputes,
  type DisputeStats,
  type DisputeView,
} from '@/services/dispute/disputes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Disputes' };

const columns: readonly DataColumn<DisputeView>[] = [
  {
    key: 'case',
    header: t('s13Portal.disputes.columns.case'),
    primary: true,
    cell: (r) => (
      <Link className="underline" href={`/disputes/${r.id}`}>
        {r.openedAt.slice(0, 10)} - {r.processorId}
      </Link>
    ),
  },
  {
    key: 'status',
    header: t('s13Portal.disputes.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s13Portal.disputes.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  { key: 'amount', header: t('s13Portal.disputes.columns.amount'), cell: (r) => `USD ${r.amount}` },
  {
    key: 'reason',
    header: t('s13Portal.disputes.columns.reason'),
    hideOnMobile: true,
    cell: (r) => t(`s13Portal.disputes.reasons.${r.reasonCategory}` as StringKey),
  },
  {
    key: 'due',
    header: t('s13Portal.disputes.columns.due'),
    cell: (r) => r.dueAt.slice(0, 10),
  },
];

export default async function DisputesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('dispute.read', 'tenant', 'dispute');
  const companyId = actor.companyId as string;
  const canRefunds = await getService('permissions').can(actor, 'dispute.refund.decide', {
    type: 'dispute',
  });
  let rows: DisputeView[] | null;
  let stats: DisputeStats | null;
  try {
    [rows, stats] = await Promise.all([listDisputes(companyId), disputeStats(companyId)]);
  } catch {
    rows = null;
    stats = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.disputes.pageTitle')}
        description={t('s13Portal.disputes.pageDescription')}
        actions={
          canRefunds ? (
            <Button asChild variant="outline">
              <Link href="/disputes/refund-requests">
                {t('s13Portal.disputes.refundRequestsLink')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {stats ? (
        <Card>
          <CardContent className="pt-sp-16">
            <dl className="grid gap-sp-12 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.open')}</dt>
                <dd className="font-semibold">{stats.open}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.submitted')}</dt>
                <dd className="font-semibold">{stats.submitted}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.winRate')}</dt>
                <dd className="font-semibold">
                  {stats.winRate === null
                    ? t('s13Portal.disputes.stats.noRate')
                    : `${stats.winRate}%`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.atStake')}</dt>
                <dd className="font-semibold">USD {stats.atStake}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.won')}</dt>
                <dd className="font-semibold">USD {stats.wonAmount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.lost')}</dt>
                <dd className="font-semibold">USD {stats.lostAmount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}
      {rows === null ? (
        <ErrorState description={t('s13Portal.disputes.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s13Portal.disputes.pageTitle')}
          empty={<EmptyState title={t('s13Portal.disputes.empty')} />}
        />
      )}
    </div>
  );
}
