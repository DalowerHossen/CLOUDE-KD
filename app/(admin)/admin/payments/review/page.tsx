// path: app/(admin)/admin/payments/review/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReviewQueue } from '@/components/payment/admin/review-queue';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { PLATFORM_ROLES } from '@/types/contracts';
import { canReadReviews, listReviewQueue, type ReviewItem } from '@/services/payment/reviews';
import { StepUpForm } from '../../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment review' };

export default async function PaymentReviewPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || !PLATFORM_ROLES.includes(actor.role) || !(await canReadReviews(actor))) notFound();
  let items: ReviewItem[] | null;
  try {
    items = await listReviewQueue();
  } catch {
    items = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Payments.review.title')}
        description={t('s10Payments.review.description')}
      />
      <StepUpForm />
      {items === null ? (
        <ErrorState description={t('s10Payments.review.loadError')} />
      ) : items.length === 0 ? (
        <EmptyState title={t('s10Payments.review.empty')} />
      ) : (
        <ReviewQueue items={items} />
      )}
    </div>
  );
}
