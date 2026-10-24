// path: app/(admin)/admin/marketing/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listCampaigns, listExperiments, listTestimonials } from '@/services/marketing/admin';
import { listLeads } from '@/services/marketing/leads';
import { getService } from '@/lib/container';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { CampaignsManager } from './_components/campaigns-manager';
import { ExperimentsManager } from './_components/experiments-manager';
import { LeadsTable } from './_components/leads-table';
import { TestimonialsManager } from './_components/testimonials-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Marketing' };

export default async function AdminMarketingPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('marketing.read', 'platform', 'marketing');
  const permissions = getService('permissions');
  const canEdit = await permissions.can(actor, 'marketing.edit', { type: 'marketing' });
  const canSend = await permissions.can(actor, 'marketing.send', { type: 'marketing' });
  const canLeads = await permissions.can(actor, 'leads.read', { type: 'lead' });
  const canEditLeads = await permissions.can(actor, 'leads.edit', { type: 'lead' });
  let data: Awaited<ReturnType<typeof load>> | null;
  try {
    data = await load(canLeads);
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-32">
      <PageHeader
        title={t('s06Public.marketingAdmin.title')}
        description={t('s06Public.marketingAdmin.description')}
      />
      {data === null ? (
        <ErrorState description={t('s06Public.cms.loadError')} />
      ) : (
        <>
          {canSend ? <StepUpForm /> : null}
          <ExperimentsManager rows={data.experiments} canEdit={canEdit} />
          <TestimonialsManager rows={data.testimonials} canEdit={canEdit} />
          {canLeads ? <LeadsTable rows={data.leads} canEdit={canEditLeads} /> : null}
          <CampaignsManager rows={data.campaigns} canEdit={canEdit} canSend={canSend} />
        </>
      )}
    </div>
  );
}

async function load(withLeads: boolean): Promise<{
  experiments: Awaited<ReturnType<typeof listExperiments>>;
  testimonials: Awaited<ReturnType<typeof listTestimonials>>;
  leads: Awaited<ReturnType<typeof listLeads>>;
  campaigns: Awaited<ReturnType<typeof listCampaigns>>;
}> {
  const [experiments, testimonials, leads, campaigns] = await Promise.all([
    listExperiments(),
    listTestimonials(),
    withLeads ? listLeads() : Promise.resolve([]),
    listCampaigns(),
  ]);
  return { experiments, testimonials, leads, campaigns };
}
