// path: app/(dashboard)/client-mail/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import Link from 'next/link';
import { BulkEstimateReminders } from '@/components/client/bulk-estimate-reminders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDeliveries, type DeliveryRow } from '@/services/portal/delivery-proof';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client mail' };

const STATUS_KEYS = ['none', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'];

function variant(row: DeliveryRow): 'success' | 'destructive' | 'secondary' | 'info' {
  if (row.status === 'bounced' || row.status === 'complained' || row.outboxStatus === 'failed')
    return 'destructive';
  if (row.outboxStatus === 'suppressed') return 'secondary';
  if (row.status === 'opened' || row.status === 'clicked' || row.status === 'delivered')
    return 'success';
  return 'info';
}

const columns: readonly DataColumn<DeliveryRow>[] = [
  {
    key: 'sent',
    header: t('s13Portal.mail.columns.sent'),
    primary: true,
    cell: (r) => r.sentAt.replace('T', ' ').slice(0, 16),
  },
  { key: 'to', header: t('s13Portal.mail.columns.to'), cell: (r) => r.toMasked },
  { key: 'subject', header: t('s13Portal.mail.columns.subject'), cell: (r) => r.subject },
  {
    key: 'doc',
    header: t('s13Portal.mail.columns.document'),
    hideOnMobile: true,
    cell: (r) => r.docType,
  },
  {
    key: 'status',
    header: t('s13Portal.mail.columns.status'),
    cell: (r) => {
      const key =
        r.outboxStatus === 'suppressed'
          ? 'suppressed'
          : STATUS_KEYS.includes(r.status)
            ? r.status
            : 'none';
      return <Badge variant={variant(r)}>{t(`s13Portal.mail.status.${key}` as StringKey)}</Badge>;
    },
  },
  {
    key: 'opened',
    header: t('s13Portal.mail.columns.opened'),
    hideOnMobile: true,
    cell: (r) => (r.openedAt ? r.openedAt.replace('T', ' ').slice(0, 16) : '-'),
  },
];

/** Owner view: every message sent to a client, with delivery, open, click and bounce status. */
export default async function ClientMailPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('portal.mail.read', 'tenant', 'client_mail');
  const permissions = getService('permissions');
  const canBulk = await permissions.can(actor, 'portal.mail.bulk', { type: 'client_mail' });
  const canDecide = await permissions.can(actor, 'portal.link.decide', { type: 'link_request' });
  let rows: DeliveryRow[] | null;
  try {
    rows = await listDeliveries(actor.companyId as string, { limit: 100 });
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.mail.title')}
        description={t('s13Portal.mail.description')}
        actions={
          canDecide ? (
            <Button asChild variant="outline">
              <Link href="/client-mail/requests">{t('s13Portal.requests.title')}</Link>
            </Button>
          ) : undefined
        }
      />
      {canBulk ? <BulkEstimateReminders /> : null}
      {rows === null ? (
        <ErrorState description={t('s13Portal.mail.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s13Portal.mail.title')}
          empty={<EmptyState title={t('s13Portal.mail.empty')} />}
        />
      )}
    </div>
  );
}
