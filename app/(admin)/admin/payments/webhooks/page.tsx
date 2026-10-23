// path: app/(admin)/admin/payments/webhooks/page.tsx
import type { Metadata } from 'next';
import { WebhookList } from '@/components/payment/admin/webhook-list';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listWebhookEvents, type WebhookListItem } from '@/services/payment/webhook-core';
import { StepUpForm } from '../../account-locks/_components/step-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Webhook deliveries' };

const STATUSES = ['received', 'processed', 'failed', 'dead_letter', 'ignored'] as const;
type Status = (typeof STATUSES)[number];

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<JSX.Element> {
  await requirePagePermission('payment.webhook.read', 'platform', 'webhook_event');
  const { status } = await searchParams;
  const active: Status | null = STATUSES.find((s) => s === status) ?? null;
  let items: WebhookListItem[] | null;
  try {
    items = await listWebhookEvents({ status: active ?? undefined, limit: 100 });
  } catch {
    items = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Payments.webhooks.title')}
        description={t('s10Payments.webhooks.description')}
      />
      <StepUpForm />
      {items === null ? (
        <ErrorState description={t('s10Payments.webhooks.loadError')} />
      ) : items.length === 0 ? (
        <EmptyState title={t('s10Payments.webhooks.empty')} />
      ) : (
        <WebhookList items={items} active={active} />
      )}
    </div>
  );
}
