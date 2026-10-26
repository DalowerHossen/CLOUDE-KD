// path: app/(admin)/admin/retention/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  listOffers,
  surveySummary,
  type OfferView,
  type SurveySummary,
} from '@/services/platform/retention';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { RetentionManager } from './_components/retention-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Retention' };

export default async function RetentionPage(): Promise<JSX.Element> {
  await requirePagePermission('retention.manage', 'platform', 'retention_offer');
  let offers: OfferView[] | null;
  let summary: SurveySummary | null;
  try {
    offers = await listOffers();
  } catch {
    offers = null;
  }
  try {
    summary = await surveySummary();
  } catch {
    summary = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s16Growth.retention.title')}
        description={t('s16Growth.retention.description')}
      />
      <StepUpForm />
      {offers === null ? (
        <ErrorState description={t('s16Growth.retention.loadError')} />
      ) : (
        <RetentionManager offers={offers} summary={summary} />
      )}
    </div>
  );
}
