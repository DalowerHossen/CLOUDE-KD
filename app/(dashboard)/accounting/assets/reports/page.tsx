// path: app/(dashboard)/accounting/assets/reports/page.tsx
import type { Metadata } from 'next';
import { z } from 'zod';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { ReportResult } from '@/lib/reports/types';
import { requirePagePermission } from '@/services/base/page-guard';
import { ASSET_REPORT_KEYS, assetReport } from '@/services/asset/reports';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Asset reports' };

const query = z.object({
  report: z.enum(ASSET_REPORT_KEYS).catch('register'),
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
});

type Row = Record<string, string> & { __id: string };

export default async function AssetReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'fixed_asset');
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const today = new Date().toISOString().slice(0, 10);
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  let table: ReportResult | null = null;
  let message: string | null = null;
  try {
    table = await assetReport(actor, q.report, from, to);
  } catch (error) {
    message =
      error instanceof Error && error.name !== 'InternalError'
        ? error.message
        : t('s15Accounting.assets.reports.loadError');
  }
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
  const totals: Row | null = table?.totals ? { ...table.totals, __id: 'total' } : null;
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s15Accounting.assets.reports.title')}
        description={t('s15Accounting.assets.reports.description')}
        actions={
          table ? (
            <>
              {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                <Button key={f} asChild variant="outline">
                  <a
                    href={`/api/accounting/assets/reports/${q.report}/export?format=${f}&from=${from}&to=${to}`}
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
        <div className="space-y-1">
          <Label htmlFor="ar-report">{t('s15Accounting.assets.reports.report')}</Label>
          <NativeSelect id="ar-report" name="report" defaultValue={q.report}>
            {ASSET_REPORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`s15Accounting.assets.reports.names.${k}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ar-from">{t('s15Accounting.common.from')}</Label>
          <Input id="ar-from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ar-to">{t('s15Accounting.common.to')}</Label>
          <Input id="ar-to" name="to" type="date" defaultValue={to} />
        </div>
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
            rows={totals ? [...rows, totals] : rows}
            getRowId={(r) => r.__id}
            caption={t(`s15Accounting.assets.reports.names.${q.report}` as StringKey)}
            empty={<EmptyState title={t('s15Accounting.assets.reports.empty')} />}
          />
        </>
      ) : null}
    </div>
  );
}
