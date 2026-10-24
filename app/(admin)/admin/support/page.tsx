// path: app/(admin)/admin/support/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t, type StringKey } from '@/lib/i18n';
import { queueQuery, QUEUE_PAGE_SIZE } from '@/lib/helpdesk/rules';
import { requirePagePermission } from '@/services/base/page-guard';
import { queue, type TicketRow } from '@/services/support/tickets';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support queue' };

const slaKey = { ok: 'slaOk', at_risk: 'slaRisk', breached: 'slaBreached', met: 'slaMet' } as const;
const columns: readonly DataColumn<TicketRow>[] = [
  { key: 'number', header: t('s07Company.support.number'), cell: (r) => r.number },
  {
    key: 'subject',
    header: t('s07Company.support.subject'),
    primary: true,
    cell: (r) => r.subject,
  },
  {
    key: 'company',
    header: t('s07Company.support.company'),
    hideOnMobile: true,
    cell: (r) => r.companyName,
  },
  {
    key: 'priority',
    header: t('s07Company.support.priority'),
    cell: (r) => t(`s07Company.support.priorities.${r.priority}` as StringKey),
  },
  {
    key: 'sla',
    header: t('s07Company.support.sla'),
    cell: (r) => (
      <Badge variant="outline">{t(`s07Company.support.${slaKey[r.sla]}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'assignee',
    header: t('s07Company.support.assignee'),
    hideOnMobile: true,
    cell: (r) => r.assigneeName || t('s07Company.support.nobody'),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/admin/support/${r.id}`}>
        {t('s07Company.support.open')}
      </Link>
    ),
  },
];

const VIEWS = [
  ['unassigned', 'viewUnassigned'],
  ['mine', 'viewMine'],
  ['all', 'viewAll'],
  ['overdue', 'viewOverdue'],
] as const;

export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('support.agent', 'platform', 'support_ticket');
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = queueQuery.safeParse(flat);
  const query = parsed.success ? parsed.data : queueQuery.parse({});
  let result: Awaited<ReturnType<typeof queue>> | null;
  try {
    result = await queue(actor, query);
  } catch {
    result = null;
  }
  const pages = result ? Math.max(1, Math.ceil(result.total / QUEUE_PAGE_SIZE)) : 1;
  const link = (view: string, page: number): string =>
    `/admin/support?view=${view}&page=${page}${query.q ? `&q=${encodeURIComponent(query.q)}` : ''}`;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.support.queueTitle')}
        description={t('s07Company.support.queueDescription')}
      />
      <nav
        className="flex flex-wrap gap-sp-12 text-sm"
        aria-label={t('s07Company.support.queueTitle')}
      >
        {VIEWS.map(([view, label]) => (
          <Link
            key={view}
            className={query.view === view ? 'font-semibold underline' : 'underline'}
            href={link(view, 1)}
          >
            {t(`s07Company.support.${label}` as StringKey)}
          </Link>
        ))}
      </nav>
      <form action="/admin/support" method="get" role="search" className="flex gap-sp-8">
        <input type="hidden" name="view" value={query.view} />
        <input
          name="q"
          defaultValue={query.q ?? ''}
          maxLength={80}
          placeholder={t('s07Company.support.search')}
          aria-label={t('s07Company.support.search')}
          className="h-10 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
      </form>
      {result === null ? (
        <ErrorState description={t('s07Company.support.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={result.rows}
            getRowId={(r) => r.id}
            caption={t('s07Company.support.queueTitle')}
            empty={<EmptyState title={t('s07Company.support.empty')} />}
          />
          {pages > 1 ? (
            <nav className="flex justify-between text-sm" aria-label="Pages">
              {query.page > 1 ? (
                <Link className="underline" href={link(query.view, query.page - 1)}>
                  {t('s07Company.support.previous')}
                </Link>
              ) : (
                <span />
              )}
              {query.page < pages ? (
                <Link className="underline" href={link(query.view, query.page + 1)}>
                  {t('s07Company.support.next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
