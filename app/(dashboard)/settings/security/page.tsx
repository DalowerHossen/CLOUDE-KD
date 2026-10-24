// path: app/(dashboard)/settings/security/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { SectionForm } from '@/components/settings/section-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getSection } from '@/services/company/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Security policy' };

export default async function PolicyPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('policy.manage', 'tenant', 'policy');
  let policy: Awaited<ReturnType<typeof getSection<'policy'>>> | null;
  try {
    policy = await getSection(actor.companyId as string, 'policy');
  } catch {
    policy = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.policy.title')}
        description={t('s07Company.policy.description')}
      />
      {policy === null ? (
        <ErrorState description={t('s07Company.settings.loadError')} />
      ) : (
        <SectionForm
          key={policy.version}
          section="policy"
          initial={policy.value as unknown as Record<string, never>}
          version={policy.version}
        />
      )}
      <p className="text-sm">
        <Link className="underline" href="/team/security">
          {t('s07Company.policy.staffLink')}
        </Link>
        {' - '}
        <Link className="underline" href="/account/security">
          {t('s07Company.policy.accountLink')}
        </Link>
      </p>
    </div>
  );
}
