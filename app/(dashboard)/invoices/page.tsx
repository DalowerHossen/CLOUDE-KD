// path: app/(dashboard)/invoices/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { INVOICE_KINDS } from '@/lib/invoice/input';
import { invoiceListQuery, type InvoiceListQuery } from '@/lib/invoice/search';
import { INVOICE_STATUSES } from '@/lib/invoice/status';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { requirePagePermission } from '@/services/base/page-guard';
import { searchInvoices, type InvoiceListItem } from '@/services/invoice/search';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoices' };

const money = (v: string): string => formatMoney(Money.parse(v));

const columns: readonly DataColumn<InvoiceListItem>[] = [
  {
    key: 'number',
    header: t('s09Invoicing.invoices.number'),
    primary: true,
    cell: (r) => r.number ?? t('s09Invoicing.invoices.draftNumber'),
  },
  { key: 'client', header: t('s09Invoicing.invoices.client'), cell: (r) => r.clientName },
  {
    key: 'issue',
    header: t('s09Invoicing.invoices.issueDate'),
    hideOnMobile: true,
    cell: (r) => r.issueDate,
  },
  {
    key: 'due',
    header: t('s09Invoicing.invoices.dueDate'),
    hideOnMobile: true,
    cell: (r) => (
      <span className={r.late ? 'text-destructive' : ''}>
        {r.dueDate}
        {r.late ? ` (${t('s09Invoicing.invoices.late')})` : ''}
      </span>
    ),
  },
  {
    key: 'status',
    header: t('s09Invoicing.invoices.status'),
    cell: (r) => (
      <Badge variant="outline">
        {t(`s09Invoicing.invoices.statuses.${r.status}` as StringKey)}
      </Badge>
    ),
  },
  { key: 'total', header: t('s09Invoicing.invoices.total'), cell: (r) => money(r.total) },
  {
    key: 'balance',
    header: t('s09Invoicing.invoices.balance'),
    hideOnMobile: true,
    cell: (r) => money(r.balance),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/invoices/${r.id}`}>
        {t('s09Invoicing.invoices.open')}
      </Link>
    ),
  },
];

function params(q: InvoiceListQuery, view: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.q) out.q = q.q;
  if (q.status) out.status = q.status;
  if (q.kind) out.kind = q.kind;
  if (q.client) out.client = q.client;
  if (q.from) out.from = q.from;
  if (q.to) out.to = q.to;
  if (q.min) out.min = q.min;
  if (q.max) out.max = q.max;
  if (q.trash) out.trash = q.trash;
  if (q.sort !== 'issue') out.sort = q.sort;
  if (q.desc !== '1') out.desc = q.desc;
  if (q.size !== '25') out.size = q.size;
  if (view === 'cards') out.view = 'cards';
  return out;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'invoice');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const view = flat.view === 'cards' ? 'cards' : 'table';
  const { view: _view, ...rest } = flat;
  void _view;
  const parsed = invoiceListQuery.safeParse(rest);
  const query = parsed.success ? parsed.data : invoiceListQuery.parse({});
  let result: Awaited<ReturnType<typeof searchInvoices>> | null;
  try {
    result = await searchInvoices(actor.companyId as string, query);
  } catch {
    result = null;
  }
  const canCreate = await getService('permissions').can(actor, 'invoice.create', {
    type: 'invoice',
  });
  const base = params(query, view);
  const nextHref = result?.next
    ? `/invoices?${new URLSearchParams({ ...base, after: result.next }).toString()}`
    : null;
  const trash = query.trash === '1';
  const filtered = Object.keys(base).some(
    (k) => !['sort', 'desc', 'size', 'view', 'trash'].includes(k),
  );
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={trash ? t('s09Invoicing.invoices.trashLink') : t('s09Invoicing.invoices.title')}
        description={t('s09Invoicing.invoices.description')}
        actions={
          <>
            <Link className="underline" href="/invoices/tax">
              {t('s09Invoicing.invoices.taxLink')}
            </Link>
            <Link className="underline" href={trash ? '/invoices' : '/invoices?trash=1'}>
              {trash ? t('s09Invoicing.invoices.title') : t('s09Invoicing.invoices.trashLink')}
            </Link>
            {canCreate ? (
              <Link className="underline" href="/invoices/new">
                {t('s09Invoicing.invoices.newInvoice')}
              </Link>
            ) : null}
          </>
        }
      />
      <form
        action="/invoices"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        {trash ? <input type="hidden" name="trash" value="1" /> : null}
        <input type="hidden" name="view" value={view} />
        <label className="lg:col-span-2">
          <span className="sr-only">{t('s09Invoicing.invoices.search')}</span>
          <Input
            name="q"
            defaultValue={query.q ?? ''}
            maxLength={80}
            placeholder={t('s09Invoicing.invoices.search')}
          />
        </label>
        <NativeSelect
          name="status"
          defaultValue={query.status ?? ''}
          aria-label={t('s09Invoicing.invoices.status')}
        >
          <option value="">{t('s09Invoicing.invoices.allStates')}</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`s09Invoicing.invoices.statuses.${s}` as StringKey)}
            </option>
          ))}
          <option value="sent,viewed,partially_paid,overdue">
            {t('s09Invoicing.invoices.openStates')}
          </option>
        </NativeSelect>
        <NativeSelect
          name="kind"
          defaultValue={query.kind ?? ''}
          aria-label={t('s09Invoicing.invoices.kind')}
        >
          <option value="">{t('s09Invoicing.invoices.allKinds')}</option>
          {INVOICE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`s09Invoicing.invoices.kinds.${k}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <label>
          <span className="block">{t('s09Invoicing.invoices.from')}</span>
          <Input type="date" name="from" defaultValue={query.from ?? ''} />
        </label>
        <label>
          <span className="block">{t('s09Invoicing.invoices.to')}</span>
          <Input type="date" name="to" defaultValue={query.to ?? ''} />
        </label>
        <Input
          name="min"
          inputMode="decimal"
          defaultValue={query.min ?? ''}
          maxLength={20}
          placeholder={t('s09Invoicing.invoices.minAmount')}
          aria-label={t('s09Invoicing.invoices.minAmount')}
        />
        <Input
          name="max"
          inputMode="decimal"
          defaultValue={query.max ?? ''}
          maxLength={20}
          placeholder={t('s09Invoicing.invoices.maxAmount')}
          aria-label={t('s09Invoicing.invoices.maxAmount')}
        />
        <NativeSelect
          name="sort"
          defaultValue={query.sort}
          aria-label={t('s09Invoicing.invoices.sortBy')}
        >
          <option value="issue">{t('s09Invoicing.invoices.sortIssue')}</option>
          <option value="due">{t('s09Invoicing.invoices.sortDue')}</option>
          <option value="amount">{t('s09Invoicing.invoices.sortAmount')}</option>
          <option value="status">{t('s09Invoicing.invoices.sortStatus')}</option>
          <option value="client">{t('s09Invoicing.invoices.sortClient')}</option>
          <option value="number">{t('s09Invoicing.invoices.sortNumber')}</option>
          <option value="created">{t('s09Invoicing.invoices.sortCreated')}</option>
        </NativeSelect>
        <NativeSelect
          name="desc"
          defaultValue={query.desc}
          aria-label={t('s09Invoicing.invoices.newestFirst')}
        >
          <option value="1">{t('s09Invoicing.invoices.orderDesc')}</option>
          <option value="0">{t('s09Invoicing.invoices.orderAsc')}</option>
        </NativeSelect>
        <NativeSelect
          name="size"
          defaultValue={query.size}
          aria-label={t('s09Invoicing.invoices.pageSize')}
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </NativeSelect>
        <div className="flex gap-sp-8">
          <Button type="submit">{t('s09Invoicing.invoices.apply')}</Button>
          <Link className="self-center underline" href="/invoices">
            {t('s09Invoicing.invoices.reset')}
          </Link>
        </div>
      </form>
      <nav className="flex gap-sp-8 text-sm" aria-label="View">
        <Link
          className={view === 'table' ? 'font-semibold underline' : 'underline'}
          href={`/invoices?${new URLSearchParams({ ...base, view: 'table' }).toString()}`}
        >
          {t('s09Invoicing.invoices.viewTable')}
        </Link>
        <Link
          className={view === 'cards' ? 'font-semibold underline' : 'underline'}
          href={`/invoices?${new URLSearchParams({ ...base, view: 'cards' }).toString()}`}
        >
          {t('s09Invoicing.invoices.viewCards')}
        </Link>
      </nav>
      {result === null ? (
        <ErrorState description={t('s09Invoicing.invoices.loadError')} />
      ) : result.rows.length === 0 ? (
        <EmptyState
          title={
            trash
              ? t('s09Invoicing.invoices.emptyTrash')
              : filtered
                ? t('s09Invoicing.invoices.emptyFiltered')
                : t('s09Invoicing.invoices.empty')
          }
        />
      ) : view === 'cards' ? (
        <ul className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-3">
          {result.rows.map((r) => (
            <li key={r.id} className="space-y-sp-4 rounded-lg border bg-card p-sp-12 text-sm">
              <div className="flex items-center justify-between">
                <Link className="font-semibold underline" href={`/invoices/${r.id}`}>
                  {r.number ?? t('s09Invoicing.invoices.draftNumber')}
                </Link>
                <Badge variant="outline">
                  {t(`s09Invoicing.invoices.statuses.${r.status}` as StringKey)}
                </Badge>
              </div>
              <p>{r.clientName}</p>
              <p className="text-muted-foreground">
                {r.issueDate} - {t('s09Invoicing.invoices.dueDate')} {r.dueDate}
                {r.late ? ` (${t('s09Invoicing.invoices.late')})` : ''}
              </p>
              <p className="text-base font-semibold">{money(r.total)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <DataTable
          columns={columns}
          rows={result.rows}
          getRowId={(r) => r.id}
          caption={t('s09Invoicing.invoices.title')}
          empty={<EmptyState title={t('s09Invoicing.invoices.empty')} />}
        />
      )}
      {nextHref ? (
        <p className="text-sm">
          <Link className="underline" href={nextHref}>
            {t('s09Invoicing.invoices.next')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
