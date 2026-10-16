// path: app/(dashboard)/onboarding/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Wizard } from '@/components/onboarding/wizard';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  onboardingView,
  startOnboarding,
  type OnboardingView,
} from '@/services/company/onboarding';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set up your workspace' };

export default async function OnboardingPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('company.manage', 'tenant', 'company');
  let view: OnboardingView | null;
  try {
    await startOnboarding(actor);
    view = actor.companyId ? await onboardingView(actor.companyId) : null;
  } catch {
    view = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.onboarding.title')}
        description={t('s07Company.onboarding.description')}
      />
      {view === null ? (
        <ErrorState description={t('s07Company.onboarding.error')} />
      ) : (
        <Wizard initial={view} />
      )}
    </div>
  );
}
