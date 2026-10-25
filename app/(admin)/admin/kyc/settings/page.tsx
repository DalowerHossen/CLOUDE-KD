// path: app/(admin)/admin/kyc/settings/page.tsx
import type { Metadata } from 'next';
import { KycSettingsForm } from '@/components/kyc/settings-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import type { KycProfile } from '@/lib/kyc/profile';
import { requirePagePermission } from '@/services/base/page-guard';
import { getKycProfile } from '@/services/kyc/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verification settings' };

export default async function KycSettingsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'kyc.settings.read',
    'platform',
    'kyc_platform_settings',
  );
  const canManage = await getService('permissions').can(actor, 'kyc.settings.manage', {
    type: 'kyc_platform_settings',
  });
  let profile: KycProfile | null;
  try {
    profile = await getKycProfile();
  } catch {
    profile = null;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.kycSettings.title')}
        description={t('s07Company.kycSettings.description')}
      />
      {profile === null ? (
        <ErrorState description={t('s07Company.kycSettings.loadError')} />
      ) : (
        <KycSettingsForm profile={profile} canManage={canManage} />
      )}
    </div>
  );
}
