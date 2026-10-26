// path: app/(admin)/admin/system/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getMaintenance,
  listKillSwitches,
  listTenantLimits,
  maintenanceActive,
} from '@/services/platform/controls';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { SystemPanel } from './_components/system-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Operations' };

interface Data {
  maintenance: Awaited<ReturnType<typeof getMaintenance>>;
  active: boolean;
  switches: Awaited<ReturnType<typeof listKillSwitches>>;
  limits: Awaited<ReturnType<typeof listTenantLimits>>;
}

async function load(): Promise<Data | null> {
  try {
    const [maintenance, active, switches, limits] = await Promise.all([
      getMaintenance(),
      maintenanceActive(),
      listKillSwitches(),
      listTenantLimits(),
    ]);
    return { maintenance, active, switches, limits };
  } catch {
    return null;
  }
}

export default async function SystemPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('system.read', 'platform', 'platform');
  const canManage = await getService('permissions').can(actor, 'system.manage', {
    type: 'platform',
  });
  const data = await load();
  if (data === null) return <ErrorState description={t('s16System.system.loadError')} />;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s16System.system.title')}
        description={t('s16System.system.description')}
      />
      {canManage ? (
        <>
          <StepUpForm />
          <SystemPanel
            maintenance={data.maintenance}
            active={data.active}
            switches={data.switches}
            limits={data.limits}
          />
        </>
      ) : (
        <p role="status" className="text-sm">
          {data.active ? t('s16System.system.maintenanceOn') : t('s16System.system.maintenanceOff')}
        </p>
      )}
    </div>
  );
}
