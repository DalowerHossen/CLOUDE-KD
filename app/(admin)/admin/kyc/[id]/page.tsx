// path: app/(admin)/admin/kyc/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { reviewDetail } from '@/services/kyc/review';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { ReviewPanel } from '../_components/review-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business verification review' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KycReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('kyc.review', 'platform', 'kyc');
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const detail = await reviewDetail(id);
  const canRead = await getService('permissions').can(actor, 'kyc.file.read', { type: 'kyc' });
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.kycAdmin.reviewTitle', { company: detail.companyName })}
        actions={
          <Link className="underline" href="/admin/kyc">
            {t('s07Company.kycAdmin.title')}
          </Link>
        }
      />
      <StepUpForm />
      <ReviewPanel detail={detail} canReview={canRead} />
    </div>
  );
}
