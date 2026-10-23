// path: app/(admin)/admin/feature-flags/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listFlags, type FlagView } from '@/services/company/flags';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { FlagManager } from './_components/flag-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Feature flags' };

export default async function FlagsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('flags.read', 'platform', 'feature_flag');
  const canManage = await getService('permissions').can(actor, 'flags.manage', {
    type: 'feature_flag',
  });
  let flags: FlagView[] | null;
  try {
    flags = await listFlags();
  } catch {
    flags = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.adminOps.flagsTitle')}
        description={t('s07Company.adminOps.flagsDescription')}
      />
      {canManage ? <StepUpForm /> : null}
      {flags === null ? (
        <ErrorState description={t('s07Company.adminOps.loadError')} />
      ) : (
        <FlagManager flags={flags} canManage={canManage} />
      )}
    </div>
  );
}
