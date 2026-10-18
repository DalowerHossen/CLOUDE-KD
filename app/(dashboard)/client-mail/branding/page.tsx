// path: app/(dashboard)/client-mail/branding/page.tsx
import type { Metadata } from 'next';
import { BrandingForm } from '@/components/client/branding-form';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client branding' };

export default async function ClientBrandingPage(): Promise<JSX.Element> {
  await requirePagePermission('company.manage', 'tenant', 'company');
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s13Portal.branding.title')}
        description={t('s13Portal.branding.description')}
      />
      <BrandingForm />
    </div>
  );
}
