// path: app/(dashboard)/settings/kyc/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { KycPanel } from '@/components/settings/kyc-panel';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { kycView, type KycView } from '@/services/kyc/owner';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business verification' };

export default async function KycPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('kyc.status', 'tenant', 'kyc');
  let view: KycView | null;
  try {
    view = actor.companyId ? await kycView(actor.companyId) : null;
  } catch {
    view = null;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader title={t('s07Company.kyc.title')} description={t('s07Company.kyc.description')} />
      {view === null ? (
        <ErrorState description={t('s07Company.kyc.loadError')} />
      ) : (
        <KycPanel view={view} />
      )}
    </div>
  );
}
