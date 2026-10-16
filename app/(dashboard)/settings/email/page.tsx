// path: app/(dashboard)/settings/email/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { EmailSettingsManager } from '@/components/email/email-settings-manager';
import { MessageLog, SuppressionList } from '@/components/email/suppression-and-log';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { settingsView, type SettingsView } from '@/services/email/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'E-mail settings' };

export default async function EmailSettingsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('email.settings.manage', 'tenant', 'email');
  let data: SettingsView | null;
  try {
    data = actor.companyId ? await settingsView(actor.companyId) : null;
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.email.title')}
        description={t('s05Storage.email.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s05Storage.email.loadError')} />
      ) : (
        <>
          <EmailSettingsManager
            endpoint="/api/email/settings/actions"
            allowPlatformMode
            providers={data.providers}
            usingPlatform={data.usingPlatform}
          />
          <section className="space-y-sp-12" aria-labelledby="sup-title">
            <h2 id="sup-title" className="text-h3 font-semibold">
              {t('s05Storage.email.suppressionsTitle')}
            </h2>
            <SuppressionList endpoint="/api/email/settings/actions" rows={data.suppressions} />
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
