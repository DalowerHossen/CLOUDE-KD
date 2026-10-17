// path: app/(admin)/admin/processors/routing/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { RoutingManager } from '@/components/payment/admin/routing-manager';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { listRegistry } from '@/lib/payment/registry';
import { requirePagePermission } from '@/services/base/page-guard';
import { listRoutingRules, type RoutingRuleView } from '@/services/payment/routing';
import { StepUpForm } from '../../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Routing rules' };

export default async function RoutingPage(): Promise<JSX.Element> {
  await requirePagePermission('payment.processor.manage', 'platform', 'routing_rule');
  let rules: RoutingRuleView[] | null;
  try {
    rules = await listRoutingRules();
  } catch {
    rules = null;
  }
  const processors = listRegistry()
    .filter((e) => e.available)
    .map((e) => ({ id: e.metadata.id, name: e.metadata.name }));
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Processors.routing.title')}
        description={t('s10Processors.routing.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/processors">{t('s10Processors.routing.back')}</Link>
          </Button>
        }
      />
      <StepUpForm />
      {rules === null ? (
        <ErrorState description={t('s10Processors.loadError')} />
      ) : (
        <RoutingManager rules={rules} processors={processors} />
      )}
    </div>
  );
}
