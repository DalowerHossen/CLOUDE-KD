// path: app/(admin)/admin/emails/settings/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { EmailSettingsManager } from '@/components/email/email-settings-manager';
import { MessageLog, SuppressionList } from '@/components/email/suppression-and-log';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { settingsView, type SettingsView } from '@/services/email/settings';
import { StepUpForm } from '../../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform e-mail settings' };

export default async function PlatformEmailSettingsPage(): Promise<JSX.Element> {
  await requirePagePermission('email.platform.manage', 'platform', 'email');
  let data: SettingsView | null;
  try {
    data = await settingsView(null);
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.email.platformTitle')}
        description={t('s05Storage.email.platformDescription')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s05Storage.email.loadError')} />
      ) : (
        <>
          <EmailSettingsManager
            endpoint="/api/admin/emails/settings/actions"
            allowPlatformMode={false}
            providers={data.providers}
            usingPlatform={false}
          />
          <section className="space-y-sp-12" aria-labelledby="sup-title">
            <h2 id="sup-title" className="text-h3 font-semibold">
              {t('s05Storage.email.suppressionsTitle')}
            </h2>
            <SuppressionList
              endpoint="/api/admin/emails/settings/actions"
              rows={data.suppressions}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="log-title">
            <h2 id="log-title" className="text-h3 font-semibold">
              {t('s05Storage.email.logTitle')}
            </h2>
            <MessageLog rows={data.log} />
          </section>
        </>
      )}
    </div>
  );
}
