// path: components/settings/logo-panel.tsx
'use client';
import { useRouter } from 'next/navigation';
import { LogoUpload } from '@/components/onboarding/logo-upload';
import { t } from '@/lib/i18n';

/** Logo block of the branding screen. After an upload the page reloads so the form carries the new version. */
export function LogoPanel({ hasLogo }: { hasLogo: boolean }): JSX.Element {
  const router = useRouter();
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">{t('s07Company.settings.logoTitle')}</h2>
      <p className="text-caption text-muted-foreground">{t('s07Company.onboarding.logo.help')}</p>
      <LogoUpload hasLogo={hasLogo} onUploaded={() => router.refresh()} />
    </div>
  );
}
