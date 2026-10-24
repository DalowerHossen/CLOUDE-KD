// path: app/(dashboard)/accounting/reports/[key]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { REPORT_CATALOG, REPORT_KEYS } from '@/config/s15-accounting';
import { t } from '@/lib/i18n';
import type { ReportResult } from '@/lib/reports/types';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts } from '@/services/accounting/accounts';
import { dayText } from '@/services/accounting/journal-rules';
import { sameDayLastYear } from '@/services/accounting/period-rules';
import { reportTable } from '@/services/accounting/report-export';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Financial report' };

const query = z.object({
  from: dayText.optional().catch(undefined),
  to: dayText.optional().catch(undefined),
  asOf: dayText.optional().catch(undefined),
  accountId: z.string().uuid().optional().catch(undefined),
  compare: z.literal('1').optional().catch(undefined),
});

type Row = Record<string, string> & { __id: string };

export default async function AccountingReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'report');
  const companyId = actor.companyId as string;
  const { key } = await params;
  const parsedKey = z.enum(REPORT_KEYS).safeParse(key);
  if (!parsedKey.success) notFound();
  const info = REPORT_CATALOG.find((r) => r.key === parsedKey.data);
  if (!info) notFound();
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const today = new Date().toISOString().slice(0, 10);
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  const asOf = q.asOf ?? today;
  const compare =
    parsedKey.data === 'profit_loss' && q.compare === '1'
      ? { compareFrom: sameDayLastYear(from), compareTo: sameDayLastYear(to) }
      : {};
  const request = {
    from,
    to,
    asOf,
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...compare,
  };
  let table: ReportResult | null = null;
  let message: string | null = null;
  const accounts = info.needs === 'account' ? await listAccounts(companyId) : [];
  if (info.needs !== 'account' || q.accountId) {
    try {
      table = await reportTable(companyId, parsedKey.data, request);
    } catch (error) {
      message =
        error instanceof Error && error.name !== 'InternalError'
          ? error.message
          : t('s15Accounting.reports.loadError');
    }
  }
  const exportQuery = new URLSearchParams(
    Object.entries(request).map(([k, v]) => [k, String(v)]),
  ).toString();
  const columns: readonly DataColumn<Row>[] = (table?.columns ?? []).map((c, i) => ({
    key: c.key,
    header: c.label,
    primary: i === 0,
    cell: (r: Row) => (
      <span
        className={
          c.type === 'money' || c.type === 'number' || c.type === 'percent'
            ? 'block text-right tabular-nums'
            : undefined
        }
      >
        {r[c.key] ?? ''}
      </span>
    ),
  }));
  const rows: Row[] = (table?.rows ?? []).map((r, i) => ({ ...r, __id: String(i) }));
  const totalsRow: Row | null = table?.totals ? { ...table.totals, __id: 'total' } : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={info.title}
        description={info.description}
        actions={
          table ? (
            <>
              {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                <Button key={f} asChild variant="outline">
                  <a
                    href={`/api/accounting/reports/${parsedKey.data}/export?format=${f}&${exportQuery}`}
                  >
                    {t('s15Accounting.common.download')}{' '}
                    {f === 'csv'
                      ? t('s15Accounting.common.csv')
                      : f === 'xlsx'
                        ? t('s15Accounting.common.excel')
                        : t('s15Accounting.common.pdf')}
                  </a>
                </Button>
              ))}
            </>
          ) : null
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-sp-8">
        {info.needs === 'date' ? (
          <div className="space-y-1">
            <Label htmlFor="r-asof">{t('s15Accounting.common.asOf')}</Label>
            <Input id="r-asof" name="asOf" type="date" defaultValue={asOf} />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="r-from">{t('s15Accounting.common.from')}</Label>
              <Input id="r-from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-to">{t('s15Accounting.common.to')}</Label>
              <Input id="r-to" name="to" type="date" defaultValue={to} />
            </div>
          </>
        )}
        {info.needs === 'account' ? (
          <div className="space-y-1">
            <Label htmlFor="r-acc">{t('s15Accounting.reports.account')}</Label>
            <NativeSelect id="r-acc" name="accountId" defaultValue={q.accountId ?? ''}>
              <option value="">{t('s15Accounting.reports.chooseAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {parsedKey.data === 'profit_loss' ? (
          <label className="flex items-center gap-2 text-sm" htmlFor="r-cmp">
            <input
              id="r-cmp"
              type="checkbox"
              name="compare"
              value="1"
              defaultChecked={q.compare === '1'}
            />
            {t('s15Accounting.reports.compare')}
          </label>
        ) : null}
        <Button type="submit">{t('s15Accounting.common.apply')}</Button>
      </form>
      {message ? <Alert variant="destructive">{message}</Alert> : null}
      {table ? (
        <>
          {table.notes.map((n) => (
            <p key={n} className="text-sm text-muted-foreground">
              {n}
            </p>
          ))}
          <DataTable
            columns={columns}
            rows={totalsRow ? [...rows, totalsRow] : rows}
            getRowId={(r) => r.__id}
            caption={info.title}
            empty={<EmptyState title={t('s15Accounting.common.empty')} />}
          />
        </>
      ) : !message && info.needs === 'account' ? (
        <EmptyState title={t('s15Accounting.reports.chooseAccount')} />
      ) : !message ? (
        <ErrorState description={t('s15Accounting.reports.loadError')} />
      ) : null}
    </div>
  );
}
