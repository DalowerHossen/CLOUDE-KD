// path: app/(admin)/admin/payments/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { PLATFORM_ROLES } from '@/types/contracts';
import { notFound } from 'next/navigation';
import { PROCESSOR_BY_ID } from '@/config/processors';
import { isKnownProcessor } from '@/lib/payment/registry';
import { canReadReviews } from '@/services/payment/reviews';
import { attentionCounts, gatewayHealth, type GatewayHealthRow } from '@/services/payment/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment overview' };

export default async function PaymentOverviewPage(): Promise<JSX.Element> {
  const actor = await getService('auth').getActor();
  if (!actor || !PLATFORM_ROLES.includes(actor.role) || !(await canReadReviews(actor))) notFound();
  let health: GatewayHealthRow[] | null;
  let counts: { inReview: string; deadLetters: string } | null;
  try {
    health = await gatewayHealth(new Date(Date.now() - 86_400_000));
  } catch {
    health = null;
  }
  try {
    counts = await attentionCounts();
  } catch {
    counts = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s10Payments.gateway.title')}
        description={t('s10Payments.gateway.description')}
      />
      {counts ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s10Payments.gateway.attention')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-sp-12 text-sm">
            <span>
              {t('s10Payments.gateway.reviewWaiting')}: <strong>{counts.inReview}</strong>
            </span>
            <span>
              {t('s10Payments.gateway.deadLetters')}: <strong>{counts.deadLetters}</strong>
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/payments/review">{t('s10Payments.gateway.openReview')}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/payments/webhooks">{t('s10Payments.gateway.openWebhooks')}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/processors">{t('s10Payments.gateway.openProcessors')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {health === null ? (
        <ErrorState description={t('s10Payments.gateway.loadError')} />
      ) : health.length === 0 ? (
        <EmptyState title={t('s10Payments.gateway.empty')} />
      ) : (
        <div className="grid gap-sp-12 md:grid-cols-2">
          {health.map((h) => (
            <Card key={h.processorId}>
              <CardHeader>
                <CardTitle>
                  {isKnownProcessor(h.processorId)
                    ? PROCESSOR_BY_ID[h.processorId].name
                    : h.processorId}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-sp-8 text-sm">
                <p>
                  {t('s10Payments.gateway.successRate')}:{' '}
                  <Badge variant={h.successRate === null ? 'secondary' : 'success'}>
                    {h.successRate === null
                      ? t('s10Payments.gateway.notEnough')
                      : `${h.successRate}%`}
                  </Badge>
                </p>
                <p>
                  {t('s10Payments.gateway.attempts')}: {h.attempts} -{' '}
                  {t('s10Payments.gateway.succeeded')}: {h.succeeded} -{' '}
                  {t('s10Payments.gateway.declined')}: {h.declined} -{' '}
                  {t('s10Payments.gateway.errors')}: {h.errors}
                </p>
                {h.declinesByCategory.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('s10Payments.gateway.declineCategories')}:{' '}
                    {h.declinesByCategory.map((c) => `${c.category} ${c.count}`).join(', ')}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
