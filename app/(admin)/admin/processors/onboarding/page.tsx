// path: app/(admin)/admin/processors/onboarding/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  listApplications,
  listCompanies,
  type ApplicationView,
} from '@/services/payment/onboarding';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { OnboardingConsole } from './_components/onboarding-console';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Merchant applications' };

export default async function OnboardingPage(): Promise<JSX.Element> {
  await requirePagePermission('payment.processor.manage', 'platform', 'processor');
  let data: { applications: ApplicationView[]; companies: { id: string; name: string }[] } | null;
  try {
    data = { applications: await listApplications(), companies: await listCompanies() };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Processors.onboarding.title')}
        description={t('s10Processors.onboarding.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/processors">{t('s10Processors.onboarding.back')}</Link>
          </Button>
        }
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s10Processors.onboarding.loadError')} />
      ) : (
        <OnboardingConsole applications={data.applications} companies={data.companies} />
      )}
    </div>
  );
}
