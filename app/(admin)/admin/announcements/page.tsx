// path: app/(admin)/admin/announcements/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAll, type AnnouncementView } from '@/services/company/announcements';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { AnnouncementManager } from './_components/announcement-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Announcements' };

export default async function AnnouncementsPage(): Promise<JSX.Element> {
  await requirePagePermission('announcement.manage', 'platform', 'announcement');
  let items: AnnouncementView[] | null;
  try {
    items = await listAll();
  } catch {
    items = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.adminOps.announcementsTitle')}
        description={t('s07Company.adminOps.announcementsDescription')}
      />
      <StepUpForm />
      {items === null ? (
        <ErrorState description={t('s07Company.adminOps.loadError')} />
      ) : (
        <AnnouncementManager items={items} nowIso={new Date().toISOString()} />
      )}
    </div>
  );
}
