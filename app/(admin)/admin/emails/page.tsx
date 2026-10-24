// path: app/(admin)/admin/emails/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { TemplateManager } from '@/components/email/template-manager';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { templateList, type TemplateListItem } from '@/services/email/template-admin';
import { StepUpForm } from '../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'E-mail templates' };

export default async function EmailTemplatesPage(): Promise<JSX.Element> {
  await requirePagePermission('email.template.manage', 'platform', 'email');
  let list: TemplateListItem[] | null;
  try {
    list = await templateList(null);
  } catch {
    list = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.templates.title')}
        description={t('s05Storage.templates.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/emails/settings">{t('s05Storage.email.platformTitle')}</Link>
          </Button>
        }
      />
      <StepUpForm />
      {list === null ? (
        <ErrorState description={t('s05Storage.templates.loadError')} />
      ) : (
        <TemplateManager
          readEndpoint="/api/admin/emails/templates"
          actionEndpoint="/api/admin/emails/templates/actions"
          templates={list}
        />
      )}
    </div>
  );
}
