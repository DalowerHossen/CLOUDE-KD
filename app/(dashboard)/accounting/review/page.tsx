// path: app/(dashboard)/accounting/review/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPostingLog, type PostingLogView } from '@/services/accounting/posting';
import { POSTING_RULES } from '@/services/accounting/posting-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Automatic postings' };

const filter = z.enum(['pending', 'failed', 'all']).catch('pending');

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'posting_log');
  const companyId = actor.companyId as string;
  const canPost = await getService('permissions').can(actor, 'accounting.journal.post', {
    type: 'posting_log',
  });
  const raw = await searchParams;
  const view = filter.parse(Array.isArray(raw.view) ? raw.view[0] : raw.view);
  let rows: PostingLogView[] | null;
  try {
    rows = await listPostingLog(
      companyId,
      view === 'pending' ? { review: 'pending' } : view === 'failed' ? { status: 'failed' } : {},
    );
  } catch {
    rows = null;
  }
  const pendingIds = (rows ?? [])
    .filter((r) => r.status === 'posted' && !r.reviewedAt)
    .map((r) => r.id)
    .slice(0, 200);
  const columns: readonly DataColumn<PostingLogView>[] = [
    {
      key: 'event',
      header: t('s15Accounting.review.columns.event'),
      primary: true,
      cell: (r) => r.eventName,
    },
    {
      key: 'status',
      header: t('s15Accounting.review.columns.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(`s15Accounting.review.statuses.${r.status}` as StringKey)}
          </Badge>
          {canPost && r.status !== 'posted' ? (
            <ActionButton
              endpoint={`/api/accounting/posting/${r.id}/retry`}
              label={t('s15Accounting.review.retry')}
              doneText={t('s15Accounting.review.retried')}
            />
          ) : null}
        </span>
      ),
    },
    {
      key: 'reason',
      header: t('s15Accounting.review.columns.reason'),
      hideOnMobile: true,
      cell: (r) => r.reason,
    },
    {
      key: 'entry',
      header: t('s15Accounting.review.columns.entry'),
      cell: (r) =>
        r.entryId ? (
          <Link className="underline" href={`/accounting/journals/${r.entryId}`}>
            {t('s15Accounting.journals.detailTitle')}
          </Link>
        ) : (
          ''
        ),
    },
    {
      key: 'when',
      header: t('s15Accounting.review.columns.when'),
      hideOnMobile: true,
      cell: (r) => r.createdAt.slice(0, 16).replace('T', ' '),
    },
  ];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.review.title')}
        description={t('s15Accounting.review.description')}
        actions={
          <>
            {(['pending', 'failed', 'all'] as const).map((v) => (
              <Link
                key={v}
                className={v === view ? 'font-semibold underline' : 'underline'}
                href={`/accounting/review?view=${v}`}
              >
                {t(`s15Accounting.review.${v}` as StringKey)}
              </Link>
            ))}
          </>
        }
      />
      {rows === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <>
          {canPost && pendingIds.length > 0 ? (
            <ActionButton
              endpoint="/api/accounting/posting/review"
              body={{ ids: pendingIds }}
              variant="default"
              label={t('s15Accounting.review.markReviewed')}
              doneText={t('s15Accounting.review.reviewed')}
            />
          ) : null}
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            caption={t('s15Accounting.review.title')}
            empty={<EmptyState title={t('s15Accounting.review.empty')} />}
          />
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('s15Accounting.review.rulesTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {POSTING_RULES.map((r) => (
              <li key={r.event}>
                <span className="font-medium">{r.title}</span> ({r.event}): {r.lines}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
