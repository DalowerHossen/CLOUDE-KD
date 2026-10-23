// path: app/(dashboard)/settings/sso/page.tsx
import type { Metadata } from 'next';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { SectionForm } from '@/components/settings/section-form';
import { SsoPanel } from '@/components/settings/sso-panel';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getSection } from '@/services/company/settings';
import { ssoReadiness, type SsoReadiness } from '@/services/company/sso';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Single sign-on' };

export default async function SsoPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('sso.manage', 'tenant', 'company');
  let data: Awaited<ReturnType<typeof getSection<'sso'>>> | null;
  let readiness: SsoReadiness | null;
  try {
    data = await getSection(actor.companyId as string, 'sso');
    readiness = await ssoReadiness(actor);
  } catch {
    data = null;
    readiness = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader title={t('s07Company.sso.title')} description={t('s07Company.sso.description')} />
      {data === null || readiness === null ? (
        <ErrorState description={t('s07Company.sso.loadError')} />
      ) : (
        <>
          <SectionForm
            key={data.version}
            section="sso"
            initial={data.value as unknown as Record<string, never>}
            version={data.version}
          />
          <StepUpForm />
          <SsoPanel readiness={readiness} />
        </>
      )}
    </div>
  );
}
