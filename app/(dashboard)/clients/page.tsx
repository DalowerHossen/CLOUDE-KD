// path: app/(dashboard)/clients/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BulkBar } from '@/components/crm/bulk-bar';
import { ExportButton } from '@/components/transfer/export-button';
import { ViewsPanel } from '@/components/crm/views-panel';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { COUNTRY_CODES, countryName } from '@/lib/company/countries';
import { getService } from '@/lib/container';
import { clientListQuery, type ClientListQuery } from '@/lib/crm/search';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { clientTags, searchClients, type ClientListItem } from '@/services/client/search';
import { listViews, type SavedView } from '@/services/client/views';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Clients' };

const columns: readonly DataColumn<ClientListItem>[] = [
  {
    key: 'select',
    header: '',
    cell: (r) => (
      <input
        type="checkbox"
        name="ids"
        value={r.id}
        aria-label={t('s08Crm.bulk.selectRow', { name: r.name })}
      />
    ),
  },
  {
    key: 'name',
    header: t('s08Crm.clients.name'),
    primary: true,
    cell: (r) => (
      <span>
        {r.name}
        {r.riskFlag !== 'none' ? (
          <Badge variant="outline" className="ml-2">
            {r.riskFlag}
          </Badge>
        ) : null}
      </span>
    ),
  },
  { key: 'email', header: t('s08Crm.clients.email'), cell: (r) => r.email ?? '-' },
  {
    key: 'country',
    header: t('s08Crm.clients.country'),
    hideOnMobile: true,
    cell: (r) => (r.country ? countryName(r.country) : '-'),
  },
  {
    key: 'tags',
    header: t('s08Crm.clients.tags'),
    hideOnMobile: true,
    cell: (r) =>
      r.tags.map((x) => (
        <Badge key={x} variant="outline" className="mr-1">
          {x}
        </Badge>
      )),
  },
  {
    key: 'owed',
    header: t('s08Crm.search.outstanding'),
    cell: (r) => formatMoney(Money.parse(r.outstanding)),
  },
  {
    key: 'last',
    header: t('s08Crm.search.lastInvoice'),
    hideOnMobile: true,
    cell: (r) => (r.lastInvoiceAt ? r.lastInvoiceAt.slice(0, 10) : t('s08Crm.search.never')),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/clients/${r.id}`}>
        {t('s08Crm.clients.open')}
      </Link>
    ),
  },
];

function params(q: ClientListQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.q) out.q = q.q;
  if (q.status) out.status = q.status;
  if (q.tag) out.tag = q.tag;
  if (q.country) out.country = q.country;
  if (q.risk) out.risk = q.risk;
  if (q.withBalance) out.withBalance = q.withBalance;
  if (q.sort !== 'name') out.sort = q.sort;
  if (q.desc === '1') out.desc = '1';
  return out;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('client.read', 'tenant', 'client');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = clientListQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : clientListQuery.parse({});
  const status = query.status ?? 'active';
  const effective: ClientListQuery = { ...query, status };
  const companyId = actor.companyId as string;
  let result: Awaited<ReturnType<typeof searchClients>> | null;
  let tags: string[] = [];
  let views: SavedView[] = [];
  try {
    [result, tags, views] = await Promise.all([
      searchClients(companyId, effective),
      clientTags(companyId).catch(() => []),
      listViews(actor, 'clients').catch(() => []),
    ]);
  } catch {
    result = null;
  }
  const perms = getService('permissions');
  const [canMerge, canBulk, canArchive, canDelete, canUpdate, canExport, canImport] =
    await Promise.all([
      perms.can(actor, 'client.merge', { type: 'client' }),
      perms.can(actor, 'client.bulk', { type: 'client' }),
      perms.can(actor, 'client.archive', { type: 'client' }),
      perms.can(actor, 'client.delete', { type: 'client' }),
      perms.can(actor, 'client.update', { type: 'client' }),
      perms.can(actor, 'list.export', { type: 'client' }),
      perms.can(actor, 'import.manage', { type: 'import_job' }),
    ]);
  const bulkActions = [
    ...(canArchive ? (['archive', 'reactivate'] as const) : []),
    ...(canUpdate ? (['add_tag', 'remove_tag', 'set_risk', 'set_terms'] as const) : []),
    ...(canDelete ? (['delete'] as const) : []),
  ];
  const base = params(effective);
  const nextHref = result?.next
    ? `/clients?${new URLSearchParams({ ...base, after: result.next }).toString()}`
    : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s08Crm.clients.title')}
        description={t('s08Crm.clients.description')}
        actions={
          <>
            {canMerge ? (
              <Link className="underline" href="/clients/duplicates">
                {t('s08Crm.search.duplicatesLink')}
              </Link>
            ) : null}
            {canImport ? (
              <Link className="underline" href="/imports">
                {t('s08Crm.transfer.importLink')}
              </Link>
            ) : null}
            {canExport ? <ExportButton target="clients" q={query.q} status={status} /> : null}
            <Link className="underline" href="/clients/new">
              {t('s08Crm.clients.newClient')}
            </Link>
          </>
        }
      />
      <form
        action="/clients"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="lg:col-span-2">
          <span className="sr-only">{t('s08Crm.search.search')}</span>
          <Input
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={80}
            placeholder={t('s08Crm.search.placeholder')}
          />
        </label>
        <NativeSelect name="status" defaultValue={status} aria-label={t('s08Crm.clients.status')}>
          <option value="active">{t('s08Crm.clients.viewActive')}</option>
          <option value="archived">{t('s08Crm.clients.viewArchived')}</option>
        </NativeSelect>
        <NativeSelect
          name="tag"
          defaultValue={query.tag ?? ''}
          aria-label={t('s08Crm.clients.tags')}
        >
          <option value="">{t('s08Crm.search.allTags')}</option>
          {tags.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="country"
          defaultValue={query.country ?? ''}
          aria-label={t('s08Crm.clients.country')}
        >
          <option value="">{t('s08Crm.search.allCountries')}</option>
          {COUNTRY_CODES.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="risk"
          defaultValue={query.risk ?? ''}
          aria-label={t('s08Crm.form.riskFlag')}
        >
          <option value="">{t('s08Crm.search.allRisks')}</option>
          <option value="none">{t('s08Crm.form.riskNone')}</option>
          <option value="watch">{t('s08Crm.form.riskWatch')}</option>
          <option value="high">{t('s08Crm.form.riskHigh')}</option>
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={query.sort} aria-label={t('s08Crm.search.sortBy')}>
          <option value="name">{t('s08Crm.search.sortName')}</option>
          <option value="created">{t('s08Crm.search.sortCreated')}</option>
          <option value="balance">{t('s08Crm.search.sortBalance')}</option>
          <option value="last_invoice">{t('s08Crm.search.sortLastInvoice')}</option>
        </NativeSelect>
        <label className="flex items-center gap-sp-8">
          <input type="checkbox" name="desc" value="1" defaultChecked={query.desc === '1'} />
          {t('s08Crm.search.desc')}
        </label>
        <label className="flex items-center gap-sp-8 lg:col-span-2">
          <input
            type="checkbox"
            name="withBalance"
            value="1"
            defaultChecked={query.withBalance === '1'}
          />
          {t('s08Crm.search.withBalance')}
        </label>
        <div className="flex gap-sp-8">
          <Button type="submit">{t('s08Crm.search.apply')}</Button>
          <Link className="self-center underline" href="/clients">
            {t('s08Crm.search.reset')}
          </Link>
        </div>
      </form>
      <ViewsPanel listKey="clients" basePath="/clients" views={views} current={base} />
      {canBulk && bulkActions.length > 0 ? <BulkBar allowed={bulkActions} /> : null}
      {result === null ? (
        <ErrorState description={t('s08Crm.clients.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s08Crm.clients.title')}
            empty={
              <EmptyState
                title={
                  status === 'active'
                    ? t('s08Crm.clients.empty')
                    : t('s08Crm.clients.emptyArchived')
                }
              />
            }
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
