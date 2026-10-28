// path: app/(admin)/admin/processors/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProcessorPanel } from '@/components/payment/admin/processor-panel';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listProcessors, type ProcessorSummary } from '@/services/payment/processors';
import { StepUpForm } from '../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment processors' };

export default async function ProcessorsPage(): Promise<JSX.Element> {
  await requirePagePermission('payment.processor.manage', 'platform', 'processor');
  let list: ProcessorSummary[] | null;
  try {
    list = await listProcessors();
  } catch {
    list = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Processors.title')}
        description={t('s10Processors.description')}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/processors/accounts">{t('s10Processors.accounts.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/processors/onboarding">{t('s10Processors.onboarding.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/processors/routing">{t('s10Processors.routing.title')}</Link>
            </Button>
          </div>
        }
      />
      <StepUpForm />
      {list === null ? (
        <ErrorState description={t('s10Processors.loadError')} />
      ) : list.length === 0 ? (
        <EmptyState title={t('s10Processors.empty')} />
      ) : (
        <div className="space-y-sp-12">
          {list.map((p) => (
            <ProcessorPanel key={p.id} summary={p} />
          ))}
        </div>
      )}
    </div>
  );
}
