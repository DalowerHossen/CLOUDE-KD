// path: app/(admin)/admin/disputes/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { PLATFORM_ROLES } from '@/types/contracts';
import {
  companyNames,
  disputeStats,
  listDisputes,
  type DisputeStats,
  type DisputeView,
} from '@/services/dispute/disputes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dispute centre' };

interface Row extends DisputeView {
  companyName: string;
}

const columns: readonly DataColumn<Row>[] = [
  {
    key: 'company',
    header: t('s13Portal.disputes.columns.company'),
    primary: true,
    cell: (r) => r.companyName,
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
  { key: 'due', header: t('s13Portal.disputes.columns.due'), cell: (r) => r.dueAt.slice(0, 10) },
];

/** Every company's disputes in one list, for the platform team (read only). */
export default async function AdminDisputesPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (
    !actor ||
    !PLATFORM_ROLES.includes(actor.role) ||
    !(await getService('permissions').can(actor, 'dispute.read.all', { type: 'dispute' }))
  )
    notFound();
  let rows: Row[] | null;
  let stats: DisputeStats | null;
  try {
    const list = await listDisputes(null, { limit: 200 });
    const names = await companyNames(list.map((d) => d.companyId));
    rows = list.map((d) => ({ ...d, companyName: names.get(d.companyId) ?? d.companyId }));
    stats = await disputeStats(null);
  } catch {
    rows = null;
    stats = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s13Portal.disputes.adminTitle')}
        description={t('s13Portal.disputes.adminDescription')}
      />
      {stats ? (
        <Card>
          <CardContent className="pt-sp-16">
            <dl className="grid gap-sp-12 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{t('s13Portal.disputes.stats.open')}</dt>
                <dd className="font-semibold">{stats.open}</dd>
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
          caption={t('s13Portal.disputes.adminTitle')}
          empty={<EmptyState title={t('s13Portal.disputes.empty')} />}
        />
      )}
    </div>
  );
}
