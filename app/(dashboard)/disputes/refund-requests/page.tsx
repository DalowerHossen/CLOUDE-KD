// path: app/(dashboard)/disputes/refund-requests/page.tsx
import type { Metadata } from 'next';
import { RefundRequestList } from '@/components/client/refund-request-list';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listRefundRequests, type RefundRequestView } from '@/services/dispute/refund-requests';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Refund requests' };

export default async function RefundRequestsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('dispute.refund.decide', 'tenant', 'dispute');
  let rows: RefundRequestView[] | null;
  try {
    rows = await listRefundRequests(actor.companyId as string);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.refunds.title')}
        description={t('s13Portal.refunds.description')}
      />
      {rows === null ? (
        <ErrorState description={t('s13Portal.refunds.loadError')} />
      ) : (
        <RefundRequestList rows={rows} />
      )}
    </div>
  );
}
