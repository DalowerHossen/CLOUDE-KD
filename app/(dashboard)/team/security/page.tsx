// path: app/(dashboard)/team/security/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { SectionForm } from '@/components/settings/section-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getSection } from '@/services/company/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Staff security' };

export default async function StaffSecurityPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('team.security', 'tenant', 'team');
  let data: {
    security: Awaited<ReturnType<typeof getSection<'security'>>>;
    approval: Awaited<ReturnType<typeof getSection<'approval'>>>;
  } | null;
  try {
    const companyId = actor.companyId as string;
    data = {
      security: await getSection(companyId, 'security'),
      approval: await getSection(companyId, 'approval'),
    };
  } catch {
    data = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-24">
      <PageHeader
        title={t('s07Company.team.securityTitle')}
        description={t('s07Company.team.securityDescription')}
        actions={
          <Link className="underline" href="/team">
            {t('s07Company.team.title')}
          </Link>
        }
      />
      {data === null ? (
        <ErrorState description={t('s07Company.settings.loadError')} />
      ) : (
        <>
          <section className="space-y-sp-12" aria-labelledby="rules">
            <h2 id="rules" className="text-h4 font-semibold">
              {t('s07Company.team.rules')}
            </h2>
            <SectionForm
              key={`s${data.security.version}`}
              section="security"
              initial={data.security.value as unknown as Record<string, never>}
              version={data.security.version}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="approvals">
            <h2 id="approvals" className="text-h4 font-semibold">
              {t('s07Company.team.approvals')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('s07Company.team.approvalsHelp')}</p>
            <SectionForm
              key={`a${data.approval.version}`}
              section="approval"
              initial={data.approval.value as unknown as Record<string, never>}
              version={data.approval.version}
            />
          </section>
          <p className="text-sm">
            {t('s07Company.team.sessionsHelp')}{' '}
            <Link className="underline" href="/account/security">
              {t('s07Company.team.sessionsLink')}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
