// path: app/(dashboard)/developers/webhooks/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import {
  CreateEndpointForm,
  StatusButton,
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
import { WEBHOOK_EVENTS } from '@/config/s16-api';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listEndpoints, type EndpointView } from '@/services/webhookout/endpoints';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Webhooks' };

const detailPath = (id: string): string => ['/developers', 'webhooks', id].join('/');

export default async function WebhooksPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'integrations.webhook.read',
    'tenant',
    'webhook_endpoint',
  );
  const canManage = await getService('permissions').can(actor, 'integrations.webhook.manage', {
    type: 'webhook_endpoint',
  });
  let endpoints: EndpointView[] | null;
  try {
    endpoints = await listEndpoints(actor.companyId as string);
  } catch {
    endpoints = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Developers.webhooks.title')}
        description={t('s16Developers.webhooks.description')}
        actions={
          <Button asChild variant="outline">
            <Link href="/developers" prefetch={false}>
              {t('s16Developers.keys.title')}
            </Link>
          </Button>
        }
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Developers.webhooks.newTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateEndpointForm events={WEBHOOK_EVENTS} />
          </CardContent>
        </Card>
      ) : null}
      {endpoints === null ? (
        <ErrorState description={t('s16Developers.common.loadError')} />
      ) : endpoints.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Developers.webhooks.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Developers.webhooks.columns.url')}</TableHead>
                  <TableHead>{t('s16Developers.webhooks.columns.events')}</TableHead>
                  <TableHead>{t('s16Developers.webhooks.columns.state')}</TableHead>
                  <TableHead>{t('s16Developers.webhooks.columns.lastSuccess')}</TableHead>
                  <TableHead>{t('s16Developers.webhooks.columns.failures')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-xs break-all font-mono text-xs">{e.url}</TableCell>
                    <TableCell className="tabular-nums">{e.events.length}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Developers.webhooks.states.${e.status}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {e.lastSuccessAt ? e.lastSuccessAt.slice(0, 16).replace('T', ' ') : '-'}
                    </TableCell>
                    <TableCell className="tabular-nums">{e.consecutiveFailures}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-start gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={detailPath(e.id)} prefetch={false}>
                            {t('s16Developers.webhooks.details')}
                          </Link>
                        </Button>
                        {canManage ? (
                          <>
                            <TestButton id={e.id} />
                            {e.status === 'active' ? (
                              <StatusButton
                                id={e.id}
                                version={e.version}
                                to="paused"
                                label={t('s16Developers.webhooks.pause')}
                              />
                            ) : (
                              <StatusButton
                                id={e.id}
                                version={e.version}
                                to="active"
                                label={t('s16Developers.webhooks.resume')}
                              />
                            )}
                            <ActionButton
                              endpoint={`/api/integrations/webhooks/${e.id}`}
                              method="DELETE"
                              variant="destructive"
                              label={t('s16Developers.webhooks.remove')}
                              doneText={t('s16Developers.webhooks.removed')}
                            />
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Developers.webhooks.verifyTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{t('s16Developers.webhooks.verifyBody')}</CardContent>
      </Card>
    </div>
  );
}
