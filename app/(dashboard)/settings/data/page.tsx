// path: app/(dashboard)/settings/data/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { DataPanel } from '@/components/settings/data-panel';
import { SectionForm } from '@/components/settings/section-form';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getSection } from '@/services/company/settings';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listRequests } from '@/services/lifecycle/data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Data and backups' };

export default async function DataPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('data.manage', 'tenant', 'data');
  let data: {
    requests: Awaited<ReturnType<typeof listRequests>>;
    backup: Awaited<ReturnType<typeof getSection<'backup'>>>;
    name: string;
  } | null;
  try {
    const companyId = actor.companyId as string;
    const company = await getAdminSupabase()
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();
    data = {
      requests: await listRequests(companyId),
      backup: await getSection(companyId, 'backup'),
      name: String(company.data?.name ?? ''),
    };
  } catch {
    data = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-24">
      <PageHeader
        title={t('s07Company.data.title')}
        description={t('s07Company.data.description')}
      />
      {data === null ? (
        <ErrorState description={t('s07Company.data.loadError')} />
      ) : (
        <>
          <StepUpForm />
          <section className="space-y-sp-12" aria-labelledby="sched">
            <h2 id="sched" className="text-h4 font-semibold">
              {t('s07Company.data.scheduleTitle')}
            </h2>
            <SectionForm
              key={data.backup.version}
              section="backup"
              initial={data.backup.value as unknown as Record<string, never>}
              version={data.backup.version}
            />
          </section>
          <DataPanel requests={data.requests} companyName={data.name} />
        </>
      )}
    </div>
  );
}
