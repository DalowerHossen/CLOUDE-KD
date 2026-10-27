// path: app/(admin)/admin/branding/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { readPlatformBrand } from '@/services/branding/platform';
import { BrandForm } from './_components/brand-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform branding' };

export default async function AdminBrandingPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('seo.read', 'platform', 'seo');
  const brand = await readPlatformBrand();
  const canEdit = actor.role === 'super_admin' || actor.role === 'ceo';
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s06Public.brandAdmin.title')}
        description={t('s06Public.brandAdmin.description')}
      />
      <BrandForm initial={brand} canEdit={canEdit} />
    </div>
  );
}
