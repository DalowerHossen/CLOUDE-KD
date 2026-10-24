// path: app/(dashboard)/developers/webhooks/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  ReplayButton,
  RotateSecretButton,
  TestButton,
} from '@/components/developers/webhook-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDeliveries, type DeliveryView } from '@/services/webhookout/deliveries';
import { getEndpoint, type EndpointView } from '@/services/webhookout/endpoints';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Webhook endpoint' };

export default async function WebhookEndpointPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'integrations.webhook.read',
    'tenant',
    'webhook_endpoint',
  );
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'integrations.webhook.manage', {
    type: 'webhook_endpoint',
  });
  let data: { endpoint: EndpointView; deliveries: DeliveryView[] } | null;
  try {
    const [endpoint, deliveries] = await Promise.all([
      getEndpoint(companyId, id),
      listDeliveries(companyId, id, 50),
    ]);
    data = { endpoint, deliveries };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Developers.webhooks.title')}
        description={data?.endpoint.url}
        actions={
          <Button asChild variant="outline">
            <Link href="/developers/webhooks" prefetch={false}>
              {t('s16Developers.webhooks.back')}
            </Link>
          </Button>
        }
      />
      {data === null ? (
        <ErrorState description={t('s16Developers.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t('s16Developers.keys.details')}
                <Badge variant="outline">
                  {t(`s16Developers.webhooks.states.${data.endpoint.status}` as StringKey)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.endpoint.description ? <p>{data.endpoint.description}</p> : null}
              <p>
                {t('s16Developers.webhooks.secretEnds')}: {data.endpoint.secretLast4}
              </p>
              {data.endpoint.previousSecretExpiresAt ? (
                <p>
                  {t('s16Developers.webhooks.previousUntil')}:{' '}
                  {data.endpoint.previousSecretExpiresAt.slice(0, 16).replace('T', ' ')}
                </p>
              ) : null}
              {data.endpoint.disabledReason ? (
                <p>
                  {t('s16Developers.webhooks.disabledReason')}: {data.endpoint.disabledReason}
                </p>
              ) : null}
              <ul className="list-disc pl-5">
                {data.endpoint.events.map((name) => (
                  <li key={name} className="font-mono text-xs">
                    {name}
                  </li>
                ))}
              </ul>
              {canManage ? (
                <div className="flex flex-wrap items-start gap-2 pt-2">
                  <TestButton id={id} />
                  <RotateSecretButton id={id} />
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Developers.webhooks.logTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s16Developers.webhooks.logEmpty')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Developers.webhooks.logColumns.event')}</TableHead>
                      <TableHead>{t('s16Developers.webhooks.logColumns.kind')}</TableHead>
                      <TableHead>{t('s16Developers.webhooks.logColumns.status')}</TableHead>
                      <TableHead>{t('s16Developers.webhooks.logColumns.tries')}</TableHead>
                      <TableHead>{t('s16Developers.webhooks.logColumns.answer')}</TableHead>
                      <TableHead>{t('s16Developers.webhooks.logColumns.when')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.eventName}</TableCell>
                        <TableCell>
                          {t(`s16Developers.webhooks.kinds.${d.kind}` as StringKey)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {t(`s16Developers.webhooks.deliveryStates.${d.status}` as StringKey)}
                          </Badge>
                          {d.nextAttemptAt &&
                          (d.status === 'retrying' || d.status === 'pending') ? (
                            <span className="block text-xs text-muted-foreground">
                              {t('s16Developers.webhooks.nextTry')}:{' '}
                              {d.nextAttemptAt.slice(0, 16).replace('T', ' ')}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums">{d.attempts}</TableCell>
                        <TableCell className="text-xs">
                          {d.lastStatusCode ?? '-'}
                          {d.lastError ? ` ${d.lastError}` : ''}
                        </TableCell>
                        <TableCell>{d.createdAt.slice(0, 16).replace('T', ' ')}</TableCell>
                        <TableCell>
                          {canManage && d.status !== 'pending' && d.status !== 'retrying' ? (
                            <ReplayButton deliveryId={d.id} />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
