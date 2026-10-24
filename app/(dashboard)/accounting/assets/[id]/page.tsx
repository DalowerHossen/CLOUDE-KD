// path: app/(dashboard)/accounting/assets/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { AttachmentForm } from '@/components/accounting/attachment-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import {
  getAsset,
  listAssetDocuments,
  scheduleOf,
  type AssetDocumentView,
  type AssetView,
} from '@/services/asset/assets';
import { listAssetCategories } from '@/services/asset/categories';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Asset' };

type ScheduleLine = Awaited<ReturnType<typeof scheduleOf>>[number];

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'fixed_asset');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'accounting.asset.manage', {
    type: 'fixed_asset',
  });
  let data: {
    asset: AssetView;
    schedule: ScheduleLine[];
    documents: AssetDocumentView[];
    category: string;
  } | null;
  try {
    const [asset, schedule, documents, categories] = await Promise.all([
      getAsset(companyId, id),
      scheduleOf(companyId, id),
      listAssetDocuments(companyId, id),
      listAssetCategories(companyId),
    ]);
    data = {
      asset,
      schedule,
      documents,
      category: categories.find((c) => c.id === asset.categoryId)?.name ?? '',
    };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const hint = t('s15Accounting.assets.fields.dateHint');
  const columns: readonly DataColumn<ScheduleLine>[] = [
    {
      key: 'number',
      header: t('s15Accounting.assets.detail.scheduleColumns.number'),
      hideOnMobile: true,
      cell: (r) => String(r.number),
    },
    {
      key: 'month',
      header: t('s15Accounting.assets.detail.scheduleColumns.month'),
      primary: true,
      cell: (r) => r.month.slice(0, 7),
    },
    {
      key: 'amount',
      header: t('s15Accounting.assets.detail.scheduleColumns.amount'),
      cell: (r) => <span className="block text-right tabular-nums">{r.amount}</span>,
    },
    {
      key: 'acc',
      header: t('s15Accounting.assets.detail.scheduleColumns.accumulated'),
      hideOnMobile: true,
      cell: (r) => <span className="block text-right tabular-nums">{r.accumulated}</span>,
    },
    {
      key: 'nbv',
      header: t('s15Accounting.assets.detail.scheduleColumns.nbv'),
      hideOnMobile: true,
      cell: (r) => <span className="block text-right tabular-nums">{r.netBookValue}</span>,
    },
    {
      key: 'booked',
      header: t('s15Accounting.assets.detail.scheduleColumns.booked'),
      cell: (r) =>
        r.booked ? t('s15Accounting.assets.detail.yes') : t('s15Accounting.assets.detail.planned'),
    },
  ];
  const a = data?.asset;
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={a?.name ?? t('s15Accounting.assets.detail.title')}
        description={data ? data.category : undefined}
        actions={
          <Button asChild variant="outline">
            <Link href="/accounting/assets" prefetch={false}>
              {t('s15Accounting.assets.detail.back')}
            </Link>
          </Button>
        }
      />
      {data === null || !a ? (
        <ErrorState description={t('s15Accounting.assets.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t('s15Accounting.assets.detail.terms')}
                <Badge variant="outline">
                  {t(`s15Accounting.assets.statuses.${a.status}` as StringKey)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-sp-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['purchaseDate', a.purchaseDate],
                    ['inServiceDate', a.inServiceDate],
                    ['cost', a.cost],
                    ['salvageValue', a.salvageValue],
                    ['lifeMonths', String(a.lifeMonths)],
                    ['method', t(`s15Accounting.assets.methods.${a.method}` as StringKey)],
                    ['location', a.location],
                    ['serialNumber', a.serialNumber],
                    ['vendor', a.vendor],
                    ['warrantyUntil', a.warrantyUntil ?? ''],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">
                      {t(`s15Accounting.assets.fields.${k}` as StringKey)}
                    </dt>
                    <dd className="tabular-nums">{v || '-'}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-muted-foreground">
                    {t('s15Accounting.assets.columns.accumulated')}
                  </dt>
                  <dd className="tabular-nums">{a.accumulated}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('s15Accounting.assets.columns.nbv')}</dt>
                  <dd className="tabular-nums">{a.netBookValue}</dd>
                </div>
                {a.disposedOn ? (
                  <div>
                    <dt className="text-muted-foreground">
                      {t('s15Accounting.assets.detail.disposedSummary')}
                    </dt>
                    <dd className="tabular-nums">
                      {a.disposedOn}; {t('s15Accounting.assets.detail.proceeds')}{' '}
                      {a.disposalProceeds}; {t('s15Accounting.assets.detail.gainLoss')}{' '}
                      {a.disposalGainLoss}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.assets.detail.scheduleTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                rows={data.schedule}
                getRowId={(r) => String(r.number)}
                caption={t('s15Accounting.assets.detail.scheduleTitle')}
                empty={<EmptyState title={t('s15Accounting.assets.detail.scheduleEmpty')} />}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.assets.detail.documentsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s15Accounting.assets.detail.documentsEmpty')}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      {d.name}
                      <Link
                        href={`/api/accounting/assets/documents/${d.id}/file`}
                        prefetch={false}
                        className="underline"
                      >
                        {t('s15Accounting.assets.detail.open')}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <AttachmentForm endpoint={`/api/accounting/assets/${id}/documents`} />
              ) : null}
            </CardContent>
          </Card>
          {canManage && a.status === 'active' ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.assets.detail.editTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonForm
                    endpoint={`/api/accounting/assets/${id}`}
                    method="PATCH"
                    fixed={{ version: a.version }}
                    submitLabel={t('s15Accounting.common.save')}
                    doneText={t('s15Accounting.assets.done')}
                    fields={[
                      {
                        name: 'name',
                        label: t('s15Accounting.assets.fields.name'),
                        initial: a.name,
                      },
                      {
                        name: 'location',
                        label: t('s15Accounting.assets.fields.location'),
                        initial: a.location,
                      },
                      {
                        name: 'serialNumber',
                        label: t('s15Accounting.assets.fields.serialNumber'),
                        initial: a.serialNumber,
                      },
                      {
                        name: 'vendor',
                        label: t('s15Accounting.assets.fields.vendor'),
                        initial: a.vendor,
                      },
                      {
                        name: 'warrantyUntil',
                        label: t('s15Accounting.assets.fields.warrantyUntil'),
                        hint,
                        initial: a.warrantyUntil ?? '',
                      },
                      {
                        name: 'warrantyNote',
                        label: t('s15Accounting.assets.fields.warrantyNote'),
                        initial: a.warrantyNote,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              {a.method === 'units_of_production' ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('s15Accounting.assets.detail.usageTitle')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-sp-12">
                    <p className="text-sm text-muted-foreground">
                      {t('s15Accounting.assets.detail.usageHelp')}
                    </p>
                    <JsonForm
                      endpoint={`/api/accounting/assets/${id}/usage`}
                      submitLabel={t('s15Accounting.common.save')}
                      doneText={t('s15Accounting.assets.detail.usageDone')}
                      fields={[
                        {
                          name: 'month',
                          label: t('s15Accounting.assets.detail.usageMonth'),
                          hint,
                          initial: `${today.slice(0, 7)}-01`,
                          required: true,
                        },
                        {
                          name: 'units',
                          label: t('s15Accounting.assets.detail.units'),
                          required: true,
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              ) : null}
              <Card>
                <CardHeader>
                  <CardTitle>{t('s15Accounting.assets.detail.disposeTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.assets.detail.disposeHelp')}
                  </p>
                  <JsonForm
                    endpoint={`/api/accounting/assets/${id}/dispose`}
                    idempotent
                    submitLabel={t('s15Accounting.assets.detail.disposeButton')}
                    doneText={t('s15Accounting.assets.detail.disposeDone')}
                    fields={[
                      {
                        name: 'disposedOn',
                        label: t('s15Accounting.assets.detail.disposedOn'),
                        hint,
                        initial: today,
                        required: true,
                      },
                      {
                        name: 'proceeds',
                        label: t('s15Accounting.assets.detail.proceeds'),
                        initial: '0',
                      },
                      { name: 'note', label: t('s15Accounting.assets.detail.note') },
                    ]}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
