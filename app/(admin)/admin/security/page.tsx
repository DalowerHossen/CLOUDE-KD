// path: app/(admin)/admin/security/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { NETWORK_POLICY } from '@/config/security';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { overview, type SecurityOverview } from '@/services/security/admin-ops';
import { AddBlock, AddWhitelist, RemoveButton } from './_components/network-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Security' };

type White = SecurityOverview['whitelist'][number];
type Block = SecurityOverview['blocks'][number];
type Evt = SecurityOverview['events'][number];

const policyRows = Object.entries(NETWORK_POLICY).map(([context, policy]) => ({ context, policy }));

const policyColumns: readonly DataColumn<(typeof policyRows)[number]>[] = [
  {
    key: 'context',
    header: t('s04Security.security.colContext'),
    primary: true,
    cell: (r) => r.context,
  },
  {
    key: 'policy',
    header: t('s04Security.security.colPolicy'),
    cell: (r) =>
      r.policy === 'block'
        ? t('s04Security.security.policyBlock')
        : t('s04Security.security.policyFlag'),
  },
];
const whiteColumns: readonly DataColumn<White>[] = [
  {
    key: 'cidr',
    header: t('s04Security.security.colNetwork'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.cidr}</span>,
  },
  { key: 'note', header: t('s04Security.security.colNote'), cell: (r) => r.note },
  {
    key: 'x',
    header: t('s04Security.security.remove'),
    cell: (r) => (
      <RemoveButton
        url={`/api/admin/security/whitelist?id=${r.id}`}
        label={t('s04Security.security.remove')}
      />
    ),
  },
];
const blockColumns: readonly DataColumn<Block>[] = [
  {
    key: 'ip',
    header: t('s04Security.security.colAddress'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.ipMasked ?? r.ipHash.slice(0, 12)}</span>,
  },
  {
    key: 'until',
    header: t('s04Security.security.colUntil'),
    cell: (r) =>
      r.permanent
        ? t('s04Security.security.forever')
        : (r.blockedUntil ?? '').replace('T', ' ').slice(0, 16),
  },
  { key: 'reason', header: t('s04Security.security.colReason'), cell: (r) => r.reason },
  {
    key: 'x',
    header: t('s04Security.security.unblock'),
    cell: (r) => (
      <RemoveButton
        url={`/api/admin/security/blocks?ipHash=${r.ipHash}`}
        label={t('s04Security.security.unblock')}
      />
    ),
  },
];
const eventColumns: readonly DataColumn<Evt>[] = [
  {
    key: 'time',
    header: t('s04Security.security.colTime'),
    cell: (r) => r.createdAt.replace('T', ' ').slice(0, 19),
  },
  {
    key: 'type',
    header: t('s04Security.security.colType'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.type}</span>,
  },
  {
    key: 'sev',
    header: t('s04Security.security.colSeverity'),
    cell: (r) => (
      <Badge
        variant={
          r.severity === 'critical' || r.severity === 'high'
            ? 'destructive'
            : r.severity === 'medium'
              ? 'warning'
              : 'outline'
        }
      >
        {r.severity}
      </Badge>
    ),
  },
  {
    key: 'src',
    header: t('s04Security.security.colSource'),
    hideOnMobile: true,
    cell: (r) => r.source,
  },
  {
    key: 'ip',
    header: t('s04Security.security.colAddress'),
    hideOnMobile: true,
    cell: (r) => r.ipMasked ?? '-',
  },
];

export default async function SecurityAdminPage(): Promise<JSX.Element> {
  await requirePagePermission('security.read', 'platform', 'security');
  let data: SecurityOverview | null;
  try {
    data = await overview();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-32">
      <PageHeader
        title={t('s04Security.security.title')}
        description={t('s04Security.security.description')}
      />
      {data === null ? (
        <ErrorState description={t('s04Security.security.loadError')} />
      ) : (
        <>
          <section className="space-y-sp-12" aria-labelledby="prov-title">
            <h2 id="prov-title" className="text-h3 font-semibold">
              {t('s04Security.security.providerTitle')}
            </h2>
            <Alert variant={data.providerConfigured ? 'success' : 'warning'}>
              <div>
                {data.providerConfigured
                  ? t('s04Security.security.providerOk', { name: data.provider })
                  : t('s04Security.security.providerNone')}
              </div>
            </Alert>
            <DataTable
              columns={policyColumns}
              rows={policyRows}
              getRowId={(r) => r.context}
              caption={t('s04Security.security.policyCaption')}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="wl-title">
            <h2 id="wl-title" className="text-h3 font-semibold">
              {t('s04Security.security.whitelistTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('s04Security.security.whitelistHelp')}
            </p>
            <AddWhitelist />
            <DataTable
              columns={whiteColumns}
              rows={data.whitelist}
              getRowId={(r) => r.id}
              caption={t('s04Security.security.whitelistTitle')}
              empty={<EmptyState title={t('s04Security.security.emptyWhitelist')} />}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="blk-title">
            <h2 id="blk-title" className="text-h3 font-semibold">
              {t('s04Security.security.blocksTitle')}
            </h2>
            <AddBlock />
            <DataTable
              columns={blockColumns}
              rows={data.blocks}
              getRowId={(r) => r.ipHash}
              caption={t('s04Security.security.blocksTitle')}
              empty={<EmptyState title={t('s04Security.security.emptyBlocks')} />}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="ev-title">
            <h2 id="ev-title" className="text-h3 font-semibold">
              {t('s04Security.security.eventsTitle')}
            </h2>
            <DataTable
              columns={eventColumns}
              rows={data.events}
              getRowId={(r) => r.id}
              caption={t('s04Security.security.eventsCaption')}
              empty={<EmptyState title={t('s04Security.security.emptyEvents')} />}
            />
          </section>
        </>
      )}
    </div>
  );
}
