// path: app/(dashboard)/integrations/stores/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
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
import { NotFoundError } from '@/lib/errors';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listLog, type LogView } from '@/services/integration/commerce-log';
import { listMappings, type MappingView } from '@/services/integration/commerce-mappings';
import { getConnection, type ConnectionView } from '@/services/integration/connections';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Store mappings and log' };

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const actor = await requirePagePermission('commerce.read', 'tenant', 'integration');
  const companyId = actor.companyId as string;
  const canSync = await getService('permissions').can(actor, 'commerce.sync', {
    type: 'integration_mapping',
  });
  const canManage = await getService('permissions').can(actor, 'commerce.manage', {
    type: 'integration',
  });
  let data: { store: ConnectionView; mappings: MappingView[]; log: LogView[] } | null;
  try {
    const [store, mappings, log] = await Promise.all([
      getConnection(companyId, id),
      listMappings(companyId, id),
      listLog(companyId, { integrationId: id, limit: 100 }),
    ]);
    data = { store, mappings, log };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={data ? data.store.name : t('s16Commerce.detail.title')}
        description={t('s16Commerce.detail.mappingsHelp')}
        actions={
          <Link href="/integrations/stores" prefetch={false} className="text-sm underline">
            {t('s16Commerce.detail.back')}
          </Link>
        }
      />
      {data === null ? (
        <ErrorState description={t('s16Commerce.common.loadError')} />
      ) : (
        <>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s16Commerce.detail.settingsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint={`/api/integrations/commerce/connections/${id}`}
                  method="PATCH"
                  fixed={{ version: data.store.version }}
                  submitLabel={t('s16Commerce.detail.settingsSave')}
                  doneText={t('s16Commerce.common.done')}
                  fields={[
                    {
                      name: 'syncMode',
                      label: t('s16Commerce.stores.syncMode'),
                      kind: 'select',
                      initial: data.store.syncMode,
                      options: (['realtime', 'hourly', 'daily'] as const).map((m) => ({
                        value: m,
                        label: t(`s16Commerce.stores.modes.${m}` as StringKey),
                      })),
                    },
                    {
                      name: 'autoClient',
                      label: t('s16Commerce.detail.autoClient'),
                      kind: 'checkbox',
                      initial: String(data.store.autoClient),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Commerce.detail.mappingsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {canSync ? (
                <JsonForm
                  endpoint={`/api/integrations/commerce/connections/${id}/mappings`}
                  method="PUT"
                  idempotent
                  resetAfter
                  submitLabel={t('s16Commerce.detail.mappingSave')}
                  doneText={t('s16Commerce.common.done')}
                  fields={[
                    { name: 'externalSku', label: t('s16Commerce.detail.sku'), required: true },
                    { name: 'productId', label: t('s16Commerce.detail.productId'), required: true },
                  ]}
                />
              ) : null}
              {data.mappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s16Commerce.detail.mappingEmpty')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Commerce.detail.sku')}</TableHead>
                      <TableHead>{t('s16Commerce.detail.productId')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.mappings.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.externalSku}</TableCell>
                        <TableCell className="break-all text-xs">{m.productId}</TableCell>
                        <TableCell>
                          {canSync ? (
                            <ActionButton
                              endpoint={`/api/integrations/commerce/connections/${id}/mappings/${m.id}`}
                              method="DELETE"
                              label={t('s16Commerce.detail.mappingRemove')}
                              doneText={t('s16Commerce.detail.mappingRemoved')}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Commerce.detail.logTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.log.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s16Commerce.detail.logEmpty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Commerce.detail.logColumns.when')}</TableHead>
                      <TableHead>{t('s16Commerce.detail.logColumns.event')}</TableHead>
                      <TableHead>{t('s16Commerce.detail.logColumns.level')}</TableHead>
                      <TableHead>{t('s16Commerce.detail.logColumns.message')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.log.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {l.createdAt.slice(0, 19).replace('T', ' ')}
                        </TableCell>
                        <TableCell>{l.event}</TableCell>
                        <TableCell>
                          <Badge variant={l.level === 'error' ? 'destructive' : 'outline'}>
                            {l.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{l.message}</TableCell>
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
