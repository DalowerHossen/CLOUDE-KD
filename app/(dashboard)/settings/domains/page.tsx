// path: app/(dashboard)/settings/domains/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { DomainsPanel } from '@/components/settings/domains-panel';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { planHas } from '@/services/company/plan';
import { listDomains, type DomainView } from '@/services/domain/domains';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Custom domains' };

export default async function DomainsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('domain.manage', 'tenant', 'domain');
  let data: { domains: DomainView[]; allowed: boolean } | null;
  try {
    const companyId = actor.companyId as string;
    data = {
      domains: await listDomains(companyId),
      allowed: await planHas(companyId, 'domain.custom'),
    };
  } catch {
    data = null;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.domains.title')}
        description={t('s07Company.domains.description')}
      />
      {data === null ? (
        <ErrorState description={t('s07Company.domains.loadError')} />
      ) : (
        <DomainsPanel {...data} />
      )}
    </div>
  );
}
