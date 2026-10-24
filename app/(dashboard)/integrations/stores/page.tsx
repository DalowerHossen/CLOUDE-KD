// path: app/(dashboard)/integrations/stores/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { ConnectStoreForm, StoreActionButton } from '@/components/integration/commerce-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ORDER_STATUSES } from '@/config/s16-commerce';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listConnections, type ConnectionView } from '@/services/integration/connections';
import { syncStatus } from '@/services/integration/commerce-log';
import { StoreTabs } from './tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Online stores' };

export default async function StoresPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('commerce.read', 'tenant', 'integration');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'commerce.manage', {
    type: 'integration',
  });
  let data: {
    stores: ConnectionView[];
    status: { orders: Record<string, number>; openConflicts: number };
  } | null;
  try {
    const [stores, status] = await Promise.all([listConnections(companyId), syncStatus(companyId)]);
    data = { stores, status };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Commerce.stores.title')}
        description={t('s16Commerce.stores.description')}
        actions={<StoreTabs current="/integrations/stores" />}
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Commerce.stores.connectTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectStoreForm />
          </CardContent>
        </Card>
      ) : null}
      {data === null ? (
        <ErrorState description={t('s16Commerce.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Commerce.stores.summaryTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {ORDER_STATUSES.map((s) => (
                  <Badge key={s} variant="outline">
                    {t(`s16Commerce.stores.summary.${s}` as StringKey)}:{' '}
                    {data.status.orders[s] ?? 0}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('s16Commerce.stores.invoiceNote')}</p>
            </CardContent>
          </Card>
          {data.stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Commerce.stores.empty')}</p>
          ) : (
            <Card>
              <CardContent className="pt-sp-16">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Commerce.stores.columns.name')}</TableHead>
                      <TableHead>{t('s16Commerce.stores.columns.store')}</TableHead>
                      <TableHead>{t('s16Commerce.stores.columns.state')}</TableHead>
                      <TableHead>{t('s16Commerce.stores.columns.sync')}</TableHead>
                      <TableHead>{t('s16Commerce.stores.columns.checked')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.stores.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          {s.name}
                          <span className="block text-xs text-muted-foreground">
                            {t(`s16Commerce.providers.${s.provider}` as StringKey)}
                            {s.secretLast4 ? ` ...${s.secretLast4}` : ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.storeUrl}
                          {s.shopName ? <span className="block">{s.shopName}</span> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {t(`s16Commerce.stores.states.${s.status}` as StringKey)}
                          </Badge>
                          <span className="block text-xs text-muted-foreground">
                            {t(
                              s.webhookReady
                                ? 's16Commerce.stores.webhookReady'
                                : 's16Commerce.stores.webhookNotReady',
                            )}
                          </span>
                          {s.lastError ? (
                            <span className="block text-xs text-destructive">{s.lastError}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {t(`s16Commerce.stores.modes.${s.syncMode}` as StringKey)}
                        </TableCell>
                        <TableCell>
                          {s.lastCheckedAt
                            ? s.lastCheckedAt.slice(0, 16).replace('T', ' ')
                            : t('s16Commerce.common.none')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-start gap-2">
                            <Link
                              href={`/integrations/stores/${s.id}`}
                              prefetch={false}
                              className="text-sm underline"
                            >
                              {t('s16Commerce.stores.openStore')}
                            </Link>
                            {canManage ? (
                              <>
                                <StoreActionButton
                                  endpoint={`/api/integrations/commerce/connections/${s.id}/check`}
                                  label={t('s16Commerce.stores.check')}
                                  doneText={t('s16Commerce.stores.checked')}
                                />
                                <StoreActionButton
                                  endpoint={`/api/integrations/commerce/connections/${s.id}/webhooks`}
                                  label={t('s16Commerce.stores.register')}
                                  doneText={t('s16Commerce.stores.registered')}
                                />
                                <ActionButton
                                  endpoint={`/api/integrations/commerce/connections/${s.id}`}
                                  method="PATCH"
                                  body={{
                                    version: s.version,
                                    status: s.status === 'active' ? 'paused' : 'active',
                                  }}
                                  label={t(
                                    s.status === 'active'
                                      ? 's16Commerce.stores.pause'
                                      : 's16Commerce.stores.resume',
                                  )}
                                  doneText={t(
                                    s.status === 'active'
                                      ? 's16Commerce.stores.paused'
                                      : 's16Commerce.stores.resumed',
                                  )}
                                />
                                <ActionButton
                                  endpoint={`/api/integrations/commerce/connections/${s.id}`}
                                  method="DELETE"
                                  variant="destructive"
                                  label={t('s16Commerce.stores.remove')}
                                  doneText={t('s16Commerce.stores.removed')}
                                />
                              </>
                            ) : null}
                          </div>
                          {!s.webhookReady ? (
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              {s.webhookUrl}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-sp-12 text-xs text-muted-foreground">
                  {t('s16Commerce.stores.webhookHelp')}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
