// path: app/(dashboard)/settings/email/templates/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { TemplateManager } from '@/components/email/template-manager';
import { StepUpForm } from '@/app/(admin)/admin/account-locks/_components/step-up-form';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { templateList, type TemplateListItem } from '@/services/email/template-admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your e-mail templates' };

export default async function TenantTemplatesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('email.settings.manage', 'tenant', 'email');
  let list: TemplateListItem[] | null;
  try {
    list = actor.companyId ? await templateList(actor.companyId) : [];
  } catch {
    list = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.templates.tenantTitle')}
        description={t('s05Storage.templates.tenantDescription')}
      />
      <StepUpForm />
      {list === null ? (
        <ErrorState description={t('s05Storage.templates.loadError')} />
      ) : list.length === 0 ? (
        <EmptyState title={t('s05Storage.templates.empty')} />
      ) : (
        <TemplateManager
          readEndpoint="/api/email/templates"
          actionEndpoint="/api/email/templates/actions"
          templates={list}
        />
      )}
    </div>
  );
}
