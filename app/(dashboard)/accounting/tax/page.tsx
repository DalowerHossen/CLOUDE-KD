// path: app/(dashboard)/accounting/tax/page.tsx
import type { Metadata } from 'next';
import { z } from 'zod';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import type { ReportResult } from '@/lib/reports/types';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  getFilingSettings,
  listDeadlines,
  listPayments,
  type DeadlineView,
  type FilingSettings,
  type PaymentView,
} from '@/services/taxfiling/filing';
import { jurisdictionsOf, TAX_REPORT_KEYS, taxReport } from '@/services/taxfiling/reports';
import { TAX_KINDS } from '@/services/taxfiling/tax-rules';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tax filing' };

const query = z.object({
  report: z.enum(TAX_REPORT_KEYS).catch('sales_tax'),
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
  jurisdiction: z.string().max(60).optional().catch(undefined),
});

type Row = Record<string, string> & { __id: string };

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'tax_filing');
  const companyId = actor.companyId as string;
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const canManage = await getService('permissions').can(actor, 'accounting.tax.manage', {
    type: 'tax_filing',
  });
  const today = new Date().toISOString().slice(0, 10);
  const from = q.from ?? `${today.slice(0, 4)}-01-01`;
  const to = q.to ?? today;
  const jurisdiction = q.jurisdiction && q.jurisdiction !== '' ? q.jurisdiction : null;
  let base: {
    settings: FilingSettings;
    deadlines: DeadlineView[];
    payments: PaymentView[];
    jurisdictions: string[];
  } | null;
  try {
    const [settings, deadlines, payments, jurisdictions] = await Promise.all([
      getFilingSettings(companyId),
      listDeadlines(companyId),
      listPayments(companyId),
      jurisdictionsOf(companyId),
    ]);
    base = { settings, deadlines, payments, jurisdictions };
  } catch {
    base = null;
  }
  let table: ReportResult | null = null;
  let message: string | null = null;
  if (base) {
    try {
      table = await taxReport(actor, q.report, from, to, jurisdiction);
    } catch (error) {
      message =
        error instanceof Error && error.name !== 'InternalError'
          ? error.message
          : t('s15Accounting.tax.reportError');
    }
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
  const deadlineColumns: readonly DataColumn<DeadlineView>[] = [
    {
      key: 'title',
      header: t('s15Accounting.tax.title2'),
      primary: true,
      cell: (r) => `${r.title}${r.jurisdiction ? ` (${r.jurisdiction})` : ''}`,
    },
    { key: 'due', header: t('s15Accounting.tax.dueOn'), cell: (r) => r.dueOn },
    {
      key: 'status',
      header: t('s15Accounting.common.status'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {r.status === 'done' ? t('s15Accounting.tax.done') : t('s15Accounting.tax.open')}
          </Badge>
          {canManage ? (
            <>
              <ActionButton
                endpoint={`/api/accounting/tax/deadlines/${r.id}`}
                method="PATCH"
                body={{ version: r.version, status: r.status === 'done' ? 'open' : 'done' }}
                label={
                  r.status === 'done'
                    ? t('s15Accounting.tax.reopen')
                    : t('s15Accounting.tax.markDone')
                }
                doneText={t('s15Accounting.tax.saved')}
              />
              <ActionButton
                endpoint={`/api/accounting/tax/deadlines/${r.id}`}
                method="DELETE"
                label={t('s15Accounting.tax.remove')}
                doneText={t('s15Accounting.tax.saved')}
              />
            </>
          ) : null}
        </span>
      ),
    },
  ];
  const paymentColumns: readonly DataColumn<PaymentView>[] = [
    {
      key: 'when',
      header: t('s15Accounting.tax.columns.when'),
      primary: true,
      cell: (r) => r.paidOn,
    },
    {
      key: 'j',
      header: t('s15Accounting.tax.columns.jurisdiction'),
      cell: (r) => `${r.jurisdiction} (${t(`s15Accounting.tax.kinds.${r.taxKind}` as StringKey)})`,
    },
    {
      key: 'period',
      header: t('s15Accounting.tax.columns.period'),
      hideOnMobile: true,
      cell: (r) => `${r.periodStart} - ${r.periodEnd}`,
    },
    {
      key: 'amount',
      header: t('s15Accounting.tax.columns.amount'),
      cell: (r) => <span className="block text-right tabular-nums">{r.amount}</span>,
    },
    {
      key: 'ref',
      header: t('s15Accounting.tax.columns.reference'),
      hideOnMobile: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          {r.reference}
          {canManage ? (
            <ActionButton
              endpoint={`/api/accounting/tax/payments/${r.id}`}
              method="DELETE"
              label={t('s15Accounting.tax.remove')}
              doneText={t('s15Accounting.tax.saved')}
            />
          ) : null}
        </span>
      ),
    },
  ];
  const hint = t('s15Accounting.tax.dateHint');
  const saved = t('s15Accounting.tax.saved');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.tax.title')}
        description={t('s15Accounting.tax.description')}
      />
      {base === null ? (
        <ErrorState description={t('s15Accounting.tax.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.tax.reportTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <form method="get" className="flex flex-wrap items-end gap-sp-8">
                <div className="space-y-1">
                  <Label htmlFor="tx-report">{t('s15Accounting.tax.report')}</Label>
                  <NativeSelect id="tx-report" name="report" defaultValue={q.report}>
                    {TAX_REPORT_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`s15Accounting.tax.names.${k}` as StringKey)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tx-j">{t('s15Accounting.tax.jurisdiction')}</Label>
                  <NativeSelect id="tx-j" name="jurisdiction" defaultValue={jurisdiction ?? ''}>
                    <option value="">{t('s15Accounting.tax.allJurisdictions')}</option>
                    {base.jurisdictions.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tx-from">{t('s15Accounting.common.from')}</Label>
                  <Input id="tx-from" name="from" type="date" defaultValue={from} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tx-to">{t('s15Accounting.common.to')}</Label>
                  <Input id="tx-to" name="to" type="date" defaultValue={to} />
                </div>
                <Button type="submit">{t('s15Accounting.common.apply')}</Button>
                {table
                  ? (['csv', 'xlsx', 'pdf'] as const).map((f) => (
                      <Button key={f} asChild variant="outline">
                        <a
                          href={`/api/accounting/tax/reports/${q.report}/export?format=${f}&from=${from}&to=${to}${jurisdiction ? `&jurisdiction=${encodeURIComponent(jurisdiction)}` : ''}`}
                        >
                          {t('s15Accounting.common.download')}{' '}
                          {f === 'csv'
                            ? t('s15Accounting.common.csv')
                            : f === 'xlsx'
                              ? t('s15Accounting.common.excel')
                              : t('s15Accounting.common.pdf')}
                        </a>
                      </Button>
                    ))
                  : null}
              </form>
              {message ? <Alert variant="destructive">{message}</Alert> : null}
              {table ? (
                <>
                  <DataTable
                    columns={columns}
                    rows={totals ? [...rows, totals] : rows}
                    getRowId={(r) => r.__id}
                    caption={t(`s15Accounting.tax.names.${q.report}` as StringKey)}
                    empty={<EmptyState title={t('s15Accounting.common.empty')} />}
                  />
                  {table.notes.map((n) => (
                    <p key={n} className="text-sm text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.tax.deadlinesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <DataTable
                columns={deadlineColumns}
                rows={base.deadlines}
                getRowId={(r) => r.id}
                caption={t('s15Accounting.tax.deadlinesTitle')}
                empty={<EmptyState title={t('s15Accounting.tax.deadlinesEmpty')} />}
              />
              {canManage ? (
                <JsonForm
                  endpoint="/api/accounting/tax/deadlines"
                  resetAfter
                  submitLabel={t('s15Accounting.tax.deadlineAdd')}
                  doneText={saved}
                  fields={[
                    { name: 'title', label: t('s15Accounting.tax.title2'), required: true },
                    { name: 'jurisdiction', label: t('s15Accounting.tax.jurisdiction') },
                    { name: 'dueOn', label: t('s15Accounting.tax.dueOn'), hint, required: true },
                    { name: 'note', label: t('s15Accounting.tax.note') },
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.tax.paymentsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <DataTable
                columns={paymentColumns}
                rows={base.payments}
                getRowId={(r) => r.id}
                caption={t('s15Accounting.tax.paymentsTitle')}
                empty={<EmptyState title={t('s15Accounting.tax.paymentsEmpty')} />}
              />
              {canManage ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('s15Accounting.tax.paymentHelp')}
                  </p>
                  <JsonForm
                    endpoint="/api/accounting/tax/payments"
                    idempotent
                    resetAfter
                    submitLabel={t('s15Accounting.tax.paymentAdd')}
                    doneText={saved}
                    fields={[
                      {
                        name: 'jurisdiction',
                        label: t('s15Accounting.tax.jurisdiction'),
                        required: true,
                      },
                      {
                        name: 'taxKind',
                        label: t('s15Accounting.tax.taxKind'),
                        kind: 'select',
                        initial: 'sales',
                        options: TAX_KINDS.map((k) => ({
                          value: k,
                          label: t(`s15Accounting.tax.kinds.${k}` as StringKey),
                        })),
                      },
                      {
                        name: 'periodStart',
                        label: t('s15Accounting.tax.periodStart'),
                        hint,
                        required: true,
                      },
                      {
                        name: 'periodEnd',
                        label: t('s15Accounting.tax.periodEnd'),
                        hint,
                        required: true,
                      },
                      { name: 'amount', label: t('s15Accounting.tax.amount'), required: true },
                      {
                        name: 'paidOn',
                        label: t('s15Accounting.tax.paidOn'),
                        hint,
                        initial: today,
                        required: true,
                      },
                      { name: 'reference', label: t('s15Accounting.tax.reference') },
                      { name: 'note', label: t('s15Accounting.tax.note') },
                    ]}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s15Accounting.tax.settingsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint="/api/accounting/tax/settings"
                  method="PUT"
                  fixed={base.settings.version === null ? {} : { version: base.settings.version }}
                  submitLabel={t('s15Accounting.common.save')}
                  doneText={saved}
                  fields={[
                    {
                      name: 'provisionRate',
                      label: t('s15Accounting.tax.provisionRate'),
                      initial: base.settings.provisionRate,
                      required: true,
                    },
                    {
                      name: 'reminderDays',
                      label: t('s15Accounting.tax.reminderDays'),
                      whole: true,
                      initial: String(base.settings.reminderDays),
                      required: true,
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
