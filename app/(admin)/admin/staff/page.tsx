// path: app/(admin)/admin/staff/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listStaff, type StaffView } from '@/services/team/admin-staff';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { StaffManager } from './_components/staff-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin staff' };

export default async function StaffPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('staff.read', 'platform', 'staff');
  const canManage = await getService('permissions').can(actor, 'staff.manage', { type: 'staff' });
  let staff: StaffView[] | null;
  try {
    staff = await listStaff();
  } catch {
    staff = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.adminOps.staffTitle')}
        description={t('s07Company.adminOps.staffDescription')}
      />
      {canManage ? <StepUpForm /> : null}
      {staff === null ? (
        <ErrorState description={t('s07Company.adminOps.loadError')} />
      ) : (
        <StaffManager staff={staff} canManage={canManage} />
      )}
    </div>
  );
}
