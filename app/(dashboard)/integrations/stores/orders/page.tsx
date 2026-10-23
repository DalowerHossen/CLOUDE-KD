// path: app/(dashboard)/integrations/stores/orders/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listConnections } from '@/services/integration/connections';
import { listOrders, type OrderView } from '@/services/integration/commerce-orders';
import { StoreTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Store orders' };

export default async function StoreOrdersPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('commerce.read', 'tenant', 'integration_order');
  const companyId = actor.companyId as string;
  const canSync = await getService('permissions').can(actor, 'commerce.sync', {
    type: 'integration_order',
  });
  let data: { orders: OrderView[]; stores: Map<string, string> } | null;
  try {
    const [orders, stores] = await Promise.all([
      listOrders(companyId, { limit: 100 }),
      listConnections(companyId),
    ]);
    data = { orders, stores: new Map(stores.map((s) => [s.id, s.name])) };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Commerce.orders.title')}
        description={t('s16Commerce.orders.description')}
        actions={<StoreTabs current="/integrations/stores/orders" />}
      />
      {data === null ? (
        <ErrorState description={t('s16Commerce.common.loadError')} />
      ) : data.orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Commerce.orders.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Commerce.orders.columns.order')}</TableHead>
                  <TableHead>{t('s16Commerce.orders.columns.store')}</TableHead>
                  <TableHead>{t('s16Commerce.orders.columns.customer')}</TableHead>
                  <TableHead>{t('s16Commerce.orders.columns.total')}</TableHead>
                  <TableHead>{t('s16Commerce.orders.columns.state')}</TableHead>
                  <TableHead>{t('s16Commerce.orders.columns.when')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      {o.number ?? o.externalId}
                      <span className="block text-xs text-muted-foreground">
                        {o.lines.length} {t('s16Commerce.orders.lines')}
                      </span>
                    </TableCell>
                    <TableCell>
                      {data.stores.get(o.integrationId) ?? t('s16Commerce.common.none')}
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.customerName ?? t('s16Commerce.common.none')}
                      {o.email ? <span className="block">{o.email}</span> : null}
                    </TableCell>
                    <TableCell>
                      {o.total === null
                        ? t('s16Commerce.common.none')
                        : `${o.total} ${o.currency ?? ''}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Commerce.stores.summary.${o.status}` as StringKey)}
                      </Badge>
                      {o.lastError ? (
                        <span className="block text-xs text-destructive">{o.lastError}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{o.receivedAt.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell>
                      {canSync && ['received', 'failed', 'conflict'].includes(o.status) ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <ActionButton
                            endpoint={`/api/integrations/commerce/orders/${o.id}/retry`}
                            label={t('s16Commerce.orders.retry')}
                            doneText={t('s16Commerce.orders.retried')}
                          />
                          <ActionButton
                            endpoint={`/api/integrations/commerce/orders/${o.id}/ignore`}
                            label={t('s16Commerce.orders.ignore')}
                            doneText={t('s16Commerce.orders.ignored')}
                          />
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
