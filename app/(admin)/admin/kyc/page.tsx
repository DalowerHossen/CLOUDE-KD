// path: app/(admin)/admin/kyc/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { reviewQueue, type QueueItem } from '@/services/kyc/review';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business verification queue' };

const utc = (v: string | null): string => (v ? v.replace('T', ' ').slice(0, 16) : '-');
const columns: readonly DataColumn<QueueItem>[] = [
  {
    key: 'company',
    header: t('s07Company.kycAdmin.company'),
    primary: true,
    cell: (r) => r.companyName,
  },
  {
    key: 'state',
    header: t('s07Company.kycAdmin.state'),
    cell: (r) => (
      <Badge variant="outline">
        {r.awaitingApproval ? t('s07Company.kycAdmin.waitingFinal') : r.status}
      </Badge>
    ),
  },
  {
    key: 'risk',
    header: t('s07Company.kycAdmin.risk'),
    hideOnMobile: true,
    cell: (r) => r.risk ?? '-',
  },
  {
    key: 'dup',
    header: t('s07Company.kycAdmin.flags'),
    hideOnMobile: true,
    cell: (r) => (r.duplicate ? t('s07Company.kycAdmin.sameContent') : ''),
  },
  {
    key: 'at',
    header: t('s07Company.kycAdmin.submitted'),
    hideOnMobile: true,
    cell: (r) => utc(r.submittedAt),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/admin/kyc/${r.id}`}>
        {t('s07Company.kycAdmin.open')}
      </Link>
    ),
  },
];

export default async function KycQueuePage(): Promise<JSX.Element> {
  await requirePagePermission('kyc.review', 'platform', 'kyc');
  let rows: QueueItem[] | null;
  try {
    rows = await reviewQueue();
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.kycAdmin.title')}
        description={t('s07Company.kycAdmin.description')}
      />
      {rows === null ? (
        <ErrorState description={t('s07Company.kycAdmin.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s07Company.kycAdmin.title')}
          empty={<EmptyState title={t('s07Company.kycAdmin.empty')} />}
        />
      )}
    </div>
  );
}
