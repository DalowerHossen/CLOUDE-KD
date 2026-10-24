// path: app/(dashboard)/payroll/preview/page.tsx
import type { Metadata } from 'next';
import { z } from 'zod';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { toInt } from '@/lib/reports/numbers';
import { requirePagePermission } from '@/services/base/page-guard';
import type { PayLine } from '@/services/payroll/calc-rules';
import { listEmployees } from '@/services/payroll/employees';
import { previewPay, type PreviewResult } from '@/services/payroll/preview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pay preview' };

const text = z.string().max(40).optional().catch(undefined);
const query = z.object({
  employeeId: z.string().uuid().optional().catch(undefined),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  regularHours: text,
  overtimeHours: text,
  sales: text,
  bonus: text,
  incentive: text,
});

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('payroll.employee.read', 'tenant', 'employee');
  const companyId = actor.companyId as string;
  const raw = await searchParams;
  const q = query.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const canPay = await getService('permissions').can(actor, 'payroll.pay.read', {
    type: 'employee',
  });
  const employees = (await listEmployees(companyId, { status: 'active' }).catch(() => [])).slice(
    0,
    500,
  );
  const today = new Date().toISOString().slice(0, 10);
  const start = q.periodStart ?? `${today.slice(0, 7)}-01`;
  const end =
    q.periodEnd ??
    new Date(Date.UTC(toInt(today.slice(0, 4)), toInt(today.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10);
  let preview: PreviewResult | null = null;
  let message: string | null = null;
  if (canPay && q.employeeId) {
    try {
      preview = await previewPay(actor, {
        employeeId: q.employeeId,
        periodStart: start,
        periodEnd: end,
        regularHours: q.regularHours || '0',
        overtimeHours: q.overtimeHours || '0',
        sales: q.sales || '0',
        bonus: q.bonus || '0',
        incentive: q.incentive || '0',
      });
    } catch (error) {
      message =
        error instanceof Error && error.name !== 'InternalError'
          ? error.message
          : t('s15Payroll.preview.error');
    }
  }
  const columns: readonly DataColumn<PayLine>[] = [
    {
      key: 'name',
      header: t('s15Payroll.preview.lineColumns.name'),
      primary: true,
      cell: (r) => `${r.code} ${r.name}`,
    },
    {
      key: 'kind',
      header: t('s15Payroll.preview.lineColumns.kind'),
      hideOnMobile: true,
      cell: (r) => t(`s15Payroll.preview.kinds.${r.kind}` as StringKey),
    },
    {
      key: 'amount',
      header: t('s15Payroll.preview.lineColumns.amount'),
      cell: (r) => <span className="block text-right tabular-nums">{r.amount}</span>,
    },
  ];
  const field = (id: string, name: keyof typeof q, label: string, def: string): JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} defaultValue={q[name] ?? def} maxLength={40} />
    </div>
  );
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Payroll.preview.title')}
        description={t('s15Payroll.preview.description')}
      />
      {!canPay ? (
        <Alert>{t('s15Payroll.preview.noPermission')}</Alert>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-sp-8">
            <div className="space-y-1">
              <Label htmlFor="pv-employee">{t('s15Payroll.preview.employee')}</Label>
              <NativeSelect id="pv-employee" name="employeeId" defaultValue={q.employeeId ?? ''}>
                <option value="">{t('s15Payroll.preview.choose')}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.number} {e.firstName} {e.lastName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pv-start">{t('s15Payroll.preview.periodStart')}</Label>
              <Input id="pv-start" name="periodStart" type="date" defaultValue={start} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pv-end">{t('s15Payroll.preview.periodEnd')}</Label>
              <Input id="pv-end" name="periodEnd" type="date" defaultValue={end} />
            </div>
            {field('pv-hours', 'regularHours', t('s15Payroll.preview.regularHours'), '0')}
            {field('pv-ot', 'overtimeHours', t('s15Payroll.preview.overtimeHours'), '0')}
            {field('pv-sales', 'sales', t('s15Payroll.preview.sales'), '0')}
            {field('pv-bonus', 'bonus', t('s15Payroll.preview.bonus'), '0')}
            {field('pv-inc', 'incentive', t('s15Payroll.preview.incentive'), '0')}
            <Button type="submit">{t('s15Payroll.preview.run')}</Button>
          </form>
          {message ? <Alert variant="destructive">{message}</Alert> : null}
          {preview ? (
            <Card>
              <CardContent className="space-y-sp-12 pt-sp-16">
                <h2 className="font-semibold">
                  {preview.employee.number} {preview.employee.name}
                </h2>
                <DataTable
                  columns={columns}
                  rows={preview.result.lines}
                  getRowId={(r) => `${r.kind}-${r.code}`}
                  caption={t('s15Payroll.preview.title')}
                  empty={<EmptyState title={t('s15Payroll.common.empty')} />}
                />
                <dl className="grid gap-sp-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ['gross', preview.result.gross],
                      ['taxable', preview.result.taxableIncome],
                      ['taxes', preview.result.employeeTaxes],
                      ['net', preview.result.net],
                      ['employerCost', preview.result.employerCost],
                      [
                        'proration',
                        `${preview.result.proration.daysPaid} / ${preview.result.proration.daysInPeriod}`,
                      ],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">
                        {t(`s15Payroll.preview.${k}` as StringKey)}
                      </dt>
                      <dd className="font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                {preview.result.warnings.map((w) => (
                  <Alert key={w} variant="destructive">
                    {w}
                  </Alert>
                ))}
                {preview.notes.map((n) => (
                  <p key={n} className="text-sm text-muted-foreground">
                    {n}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
