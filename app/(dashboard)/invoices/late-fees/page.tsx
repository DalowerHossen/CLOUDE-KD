// path: app/(dashboard)/invoices/late-fees/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LateFeeManager } from '@/components/dunning/late-fee-manager';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getLateFeeSettings, listLateFees } from '@/services/invoice/late-fees';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Late fees' };

export default async function LateFeesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'late_fee');
  const companyId = actor.companyId as string;
  const [settings, fees, canManage] = await Promise.all([
    getLateFeeSettings(companyId),
    listLateFees(companyId, { limit: 100 }),
    getService('permissions').can(actor, 'latefee.manage', { type: 'late_fee' }),
  ]);
  const { version, ...value } = settings;
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s09Dunning.fees.title')}
        description={t('s09Dunning.fees.description')}
        actions={
          <Link className="underline" href="/invoices">
            {t('s09Dunning.back')}
          </Link>
        }
      />
      <LateFeeManager initial={value} version={version} fees={fees} canManage={canManage} />
    </div>
  );
}
