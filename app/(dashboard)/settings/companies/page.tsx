// path: app/(dashboard)/settings/companies/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { CompaniesPanel } from '@/components/settings/companies-panel';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { myCompanies, type MyCompany } from '@/services/company/companies';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My companies' };

export default async function CompaniesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('company.switch', 'tenant', 'company');
  let companies: MyCompany[] | null;
  try {
    companies = await myCompanies(actor);
  } catch {
    companies = null;
  }
  const canAdd =
    actor.role === 'owner' && actor.companyId
      ? await getService('entitlement').has(actor.companyId, 'sso.ready')
      : false;
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.companies.title')}
        description={t('s07Company.companies.description')}
      />
      <StepUpForm />
      {companies === null ? (
        <ErrorState description={t('s07Company.companies.loadError')} />
      ) : (
        <CompaniesPanel companies={companies} canAdd={canAdd} />
      )}
    </div>
  );
}
