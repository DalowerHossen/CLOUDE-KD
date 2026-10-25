// path: app/(admin)/admin/processors/health/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { HealthBoard } from '@/components/payment/admin/health-board';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { HEALTH_DEFAULTS } from '@/config/processor-health';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listHealth, type HealthView } from '@/services/payment/health';
import { StepUpForm } from '../../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Processor health' };

export default async function ProcessorHealthPage(): Promise<JSX.Element> {
  await requirePagePermission('payment.processor.manage', 'platform', 'processor');
  let list: HealthView[] | null;
  try {
    list = await listHealth();
  } catch {
    list = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s10Processors.health.title')}
        description={t('s10Processors.health.description', {
          count: HEALTH_DEFAULTS.consecutiveFailuresAllowed,
        })}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/processors">{t('s10Processors.health.back')}</Link>
          </Button>
        }
      />
      <StepUpForm />
      {list === null ? (
        <ErrorState description={t('s10Processors.health.loadError')} />
      ) : (
        <HealthBoard initial={list} />
      )}
    </div>
  );
}
