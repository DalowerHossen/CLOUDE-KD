// path: app/(dashboard)/client-mail/requests/page.tsx
import type { Metadata } from 'next';
import { LinkRequestList } from '@/components/client/link-request-list';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listLinkRequests, type LinkRequestView } from '@/services/portal/link-requests';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Link requests' };

export default async function LinkRequestsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('portal.link.decide', 'tenant', 'link_request');
  let rows: LinkRequestView[] | null;
  try {
    rows = await listLinkRequests(actor.companyId as string);
  } catch {
    rows = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.requests.title')}
        description={t('s13Portal.requests.description')}
      />
      {rows === null ? (
        <ErrorState description={t('s13Portal.requests.loadError')} />
      ) : (
        <LinkRequestList rows={rows} />
      )}
    </div>
  );
}
