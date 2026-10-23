// path: app/(dashboard)/inventory/documents/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { DOCUMENT_KINDS, documentListQuery } from '@/lib/stock/documents';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listDocuments, type DocumentRow } from '@/services/inventory/documents';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock documents' };

const columns: readonly DataColumn<DocumentRow>[] = [
  { key: 'number', header: t('s08Crm.documents.number'), primary: true, cell: (r) => r.number },
  {
    key: 'kind',
    header: t('s08Crm.documents.kind'),
    cell: (r) => t(`s08Crm.documents.kinds.${r.kind}` as StringKey),
  },
  {
    key: 'party',
    header: t('s08Crm.documents.party'),
    hideOnMobile: true,
    cell: (r) => r.partyName || '-',
  },
  {
    key: 'wh',
    header: t('s08Crm.documents.warehouse'),
    hideOnMobile: true,
    cell: (r) => r.warehouseName,
  },
  {
    key: 'status',
    header: t('s08Crm.documents.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s08Crm.documents.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'created',
    header: t('s08Crm.documents.created'),
    hideOnMobile: true,
    cell: (r) => r.createdAt.slice(0, 10),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/inventory/documents/${r.id}`}>
        {t('s08Crm.documents.open')}
      </Link>
    ),
  },
];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('inventory.read', 'tenant', 'inventory_document');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = documentListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : documentListQuery.parse({});
  let result: Awaited<ReturnType<typeof listDocuments>> | null;
  try {
    result = await listDocuments(actor.companyId as string, query);
  } catch {
    result = null;
  }
  const base = new URLSearchParams();
  if (query.kind) base.set('kind', query.kind);
  if (query.status) base.set('status', query.status);
  const nextHref = result?.next
    ? `/inventory/documents?${new URLSearchParams([...base.entries(), ['after', result.next]]).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.documents.title')}
        description={t('s08Crm.documents.description')}
        actions={
          <>
            <Link className="underline" href="/inventory/counts">
              {t('s08Crm.documents.countsLink')}
            </Link>
            <Link className="underline" href="/inventory/scan">
              {t('s08Crm.documents.scanLink')}
            </Link>
            <Link className="underline" href="/inventory/documents/new">
              {t('s08Crm.documents.newDocument')}
            </Link>
          </>
        }
      />
      <form
        action="/inventory/documents"
        method="get"
        className="flex flex-wrap items-end gap-sp-8 text-sm"
      >
        <NativeSelect
          name="kind"
          defaultValue={query.kind ?? ''}
          aria-label={t('s08Crm.documents.kind')}
        >
          <option value="">{t('s08Crm.documents.allKinds')}</option>
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`s08Crm.documents.kinds.${k}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="status"
          defaultValue={query.status ?? ''}
          aria-label={t('s08Crm.documents.status')}
        >
          <option value="">{t('s08Crm.documents.allStates')}</option>
          <option value="draft">{t('s08Crm.documents.statuses.draft')}</option>
          <option value="posted">{t('s08Crm.documents.statuses.posted')}</option>
          <option value="cancelled">{t('s08Crm.documents.statuses.cancelled')}</option>
        </NativeSelect>
        <Button type="submit">{t('s08Crm.documents.apply')}</Button>
      </form>
      {result === null ? (
        <ErrorState description={t('s08Crm.documents.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.documents.title')}
            empty={<EmptyState title={t('s08Crm.documents.empty')} />}
          />
          {nextHref ? (
            <p className="text-sm">
              <Link className="underline" href={nextHref}>
                {t('s08Crm.search.next')}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
