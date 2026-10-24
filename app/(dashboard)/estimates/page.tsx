// path: app/(dashboard)/estimates/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { ESTIMATE_STATUSES } from '@/lib/estimate/status';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { listEstimates, type EstimateView } from '@/services/estimate/estimates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Estimates' };

const columns: readonly DataColumn<EstimateView>[] = [
  {
    key: 'number',
    header: t('s09Estimates.columns.number'),
    primary: true,
    cell: (r) => r.number ?? t('s09Invoicing.invoices.draftNumber'),
  },
  { key: 'client', header: t('s09Estimates.columns.client'), cell: (r) => r.clientName },
  {
    key: 'valid',
    header: t('s09Estimates.columns.validUntil'),
    hideOnMobile: true,
    cell: (r) => r.validUntil,
  },
  {
    key: 'status',
    header: t('s09Estimates.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s09Estimates.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'total',
    header: t('s09Estimates.columns.total'),
    cell: (r) => formatMoney(Money.parse(r.total)),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/estimates/${r.id}`}>
        {t('s09Invoicing.invoices.open')}
      </Link>
    ),
  },
];

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('estimate.read', 'tenant', 'estimate');
  const raw = await searchParams;
  const one = (k: string): string => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const status = ESTIMATE_STATUSES.find((s) => s === one('status')) ?? null;
  const trash = one('trash') === '1';
  const q = one('q').slice(0, 80);
  let rows: EstimateView[] | null;
  try {
    rows = await listEstimates(actor.companyId as string, {
      status,
      q,
      trashed: trash,
      limit: 100,
    });
  } catch {
    rows = null;
  }
  const canCreate = await getService('permissions').can(actor, 'estimate.create', {
    type: 'estimate',
  });
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={trash ? t('s09Estimates.trashLink') : t('s09Estimates.title')}
        description={t('s09Estimates.description')}
        actions={
          <>
            <Link className="underline" href={trash ? '/estimates' : '/estimates?trash=1'}>
              {trash ? t('s09Estimates.title') : t('s09Estimates.trashLink')}
            </Link>
            {canCreate ? (
              <Link className="underline" href="/estimates/new">
                {t('s09Estimates.newEstimate')}
              </Link>
            ) : null}
          </>
        }
      />
      <form
        action="/estimates"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-3"
      >
        {trash ? <input type="hidden" name="trash" value="1" /> : null}
        <label className="sm:col-span-2">
          <span className="sr-only">{t('s09Estimates.searchPlaceholder')}</span>
          <Input
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder={t('s09Estimates.searchPlaceholder')}
          />
        </label>
        <NativeSelect
          name="status"
          defaultValue={status ?? ''}
          aria-label={t('s09Estimates.columns.status')}
        >
          <option value="">{t('s09Estimates.allStatuses')}</option>
          {ESTIMATE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`s09Estimates.statuses.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
      </form>
      {rows === null ? (
        <ErrorState description={t('s09Invoicing.invoices.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s09Estimates.title')}
          empty={<EmptyState title={t('s09Estimates.noEstimates')} />}
        />
      )}
    </div>
  );
}
