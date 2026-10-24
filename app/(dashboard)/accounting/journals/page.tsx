// path: app/(dashboard)/accounting/journals/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { CsvImportForm } from '@/components/accounting/csv-import-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listJournals, type JournalSummary } from '@/services/accounting/journals';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Journal entries' };

const PAGE = 50;
const query = z.object({
  status: z.enum(['draft', 'pending_approval', 'posted']).optional().catch(undefined),
  source: z
    .enum(['manual', 'system', 'import', 'reversal', 'recurring'])
    .optional()
    .catch(undefined),
  accountId: z.string().uuid().optional().catch(undefined),
  q: z.string().max(60).optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

const columns: readonly DataColumn<JournalSummary>[] = [
  {
    key: 'number',
    header: t('s15Accounting.journals.columns.number'),
    primary: true,
    cell: (r) => (
      <Link className="underline" href={`/accounting/journals/${r.id}`}>
        {r.number ?? t('s15Accounting.journals.statuses.draft')}
      </Link>
    ),
  },
  { key: 'date', header: t('s15Accounting.journals.columns.date'), cell: (r) => r.entryDate },
  {
    key: 'memo',
    header: t('s15Accounting.journals.columns.memo'),
    hideOnMobile: true,
    cell: (r) => r.memo,
  },
  {
    key: 'source',
    header: t('s15Accounting.journals.columns.source'),
    hideOnMobile: true,
    cell: (r) => t(`s15Accounting.journals.sources.${r.source}` as StringKey),
  },
  { key: 'total', header: t('s15Accounting.journals.columns.total'), cell: (r) => r.total },
  {
    key: 'status',
    header: t('s15Accounting.journals.columns.status'),
    cell: (r) => (
      <Badge variant="outline">
        {t(`s15Accounting.journals.statuses.${r.status}` as StringKey)}
      </Badge>
    ),
  },
];

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'journal_entry');
  const companyId = actor.companyId as string;
  const canCreate = await getService('permissions').can(actor, 'accounting.journal.create', {
    type: 'journal_entry',
  });
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const page = q.page ?? 1;
  let data: { rows: JournalSummary[]; total: number } | null;
  try {
    data = await listJournals(companyId, { ...q, limit: PAGE, offset: (page - 1) * PAGE });
  } catch {
    data = null;
  }
  const keep = (p: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...q, page: p }))
      if (v !== undefined && v !== '') params.set(k, String(v));
    return `/accounting/journals?${params.toString()}`;
  };
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.journals.title')}
        description={t('s15Accounting.journals.description')}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/accounting/journals/new">{t('s15Accounting.journals.new')}</Link>
            </Button>
          ) : null
        }
      />
      <form method="get" className="grid gap-sp-8 sm:grid-cols-6">
        <Input
          name="q"
          defaultValue={q.q ?? ''}
          placeholder={t('s15Accounting.journals.search')}
          aria-label={t('s15Accounting.journals.search')}
          maxLength={60}
          className="sm:col-span-2"
        />
        <Input
          name="from"
          type="date"
          defaultValue={q.from ?? ''}
          aria-label={t('s15Accounting.common.from')}
        />
        <Input
          name="to"
          type="date"
          defaultValue={q.to ?? ''}
          aria-label={t('s15Accounting.common.to')}
        />
        <NativeSelect
          name="status"
          defaultValue={q.status ?? ''}
          aria-label={t('s15Accounting.journals.filterStatus')}
        >
          <option value="">{t('s15Accounting.journals.all')}</option>
          {(['draft', 'pending_approval', 'posted'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`s15Accounting.journals.statuses.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="source"
          defaultValue={q.source ?? ''}
          aria-label={t('s15Accounting.journals.filterSource')}
        >
          <option value="">{t('s15Accounting.journals.all')}</option>
          {(['manual', 'system', 'import', 'reversal', 'recurring'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`s15Accounting.journals.sources.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
        {q.accountId ? <input type="hidden" name="accountId" value={q.accountId} /> : null}
        <Button type="submit" variant="outline">
          {t('s15Accounting.common.apply')}
        </Button>
      </form>
      {data === null ? (
        <ErrorState description={t('s15Accounting.common.loadError')} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data.rows}
            getRowId={(r) => r.id}
            caption={t('s15Accounting.journals.title')}
            empty={<EmptyState title={t('s15Accounting.journals.empty')} />}
          />
          <nav
            className="flex items-center justify-between text-sm"
            aria-label={t('s15Accounting.journals.title')}
          >
            {page > 1 ? (
              <Link className="underline" href={keep(page - 1)}>
                {t('s15Accounting.common.back')}
              </Link>
            ) : (
              <span />
            )}
            {page * PAGE < data.total ? (
              <Link className="underline" href={keep(page + 1)}>
                {page + 1}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s15Accounting.journals.importTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CsvImportForm
              endpoint="/api/accounting/journals/import"
              help={t('s15Accounting.journals.importHelp')}
              submitLabel={t('s15Accounting.accounts.import')}
              doneText={t('s15Accounting.journals.imported')}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
