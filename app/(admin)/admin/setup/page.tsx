// path: app/(admin)/admin/setup/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { setupView, type SetupView } from '@/services/company/platform-setup';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { SetupWizard } from './_components/setup-wizard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform setup' };

export default async function SetupPage(): Promise<JSX.Element> {
  await requirePagePermission('setup.manage', 'platform', 'platform');
  let view: SetupView | null;
  try {
    view = await setupView();
  } catch {
    view = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.adminOps.setupTitle')}
        description={t('s07Company.adminOps.setupDescription')}
      />
      <StepUpForm />
      {view === null ? (
        <ErrorState description={t('s07Company.adminOps.loadError')} />
      ) : (
        <SetupWizard view={view} />
      )}
    </div>
  );
}
