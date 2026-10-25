// path: app/(dashboard)/account/profile/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/account/profile-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { getOwnProfile } from '@/services/account/profile';
import { currentActor } from '@/services/auth/actor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My profile' };

export default async function ProfilePage(): Promise<JSX.Element> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  let profile: Awaited<ReturnType<typeof getOwnProfile>> | null;
  try {
    profile = await getOwnProfile(actor);
  } catch {
    profile = null;
  }
  const zones = Intl.supportedValuesOf('timeZone');
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('s03Auth.profile.title')}
        description={t('s03Auth.profile.description')}
      />
      {profile === null ? (
        <ErrorState description={t('s03Auth.profile.loadError')} />
      ) : (
        <ProfileForm
          key={profile.version}
          initial={profile}
          zones={zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones]}
        />
      )}
    </div>
  );
}
