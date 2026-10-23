// path: services/payroll/preview.ts
// Pay preview: the calculation for one employee and one period, shown before anything is saved. It reads the employee's pay
// details (so it needs the pay permission), the salary structure, the company settings and the active tax rules, and writes only an
// audit entry. The year to date is zero here; the pay runs of 15.8.b pass the real year to date.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import type { Actor } from '@/types/contracts';
import { dayText } from '@/services/accounting/journal-rules';
import { calculatePay, type PayInput, type PayResult } from './calc-rules';
import { payDetails } from './employees';
import { PERIODS_PER_YEAR } from './payroll-rules';
import { getPayrollSettings, itemsForStructure } from './structures';
import { listTaxRules } from './tax-settings';

const hours = z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, 'Enter hours like 160 or 7.5.');
const amount = z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 1000 or 1000.50.');

export const previewInput = z
  .object({
    employeeId: z.string().uuid(),
    periodStart: dayText,
    periodEnd: dayText,
    regularHours: hours.default('0'),
    overtimeHours: hours.default('0'),
    sales: amount.default('0'),
    bonus: amount.default('0'),
    incentive: amount.default('0'),
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'The period cannot end before it starts.',
    path: ['periodEnd'],
  })
  .refine(
    (v) =>
      Date.parse(`${v.periodEnd}T00:00:00Z`) - Date.parse(`${v.periodStart}T00:00:00Z`) <=
      31 * 86_400_000,
    {
      message: 'A pay period is at most 31 days.',
      path: ['periodEnd'],
    },
  );

export interface PreviewResult {
  employee: { id: string; number: string; name: string };
  result: PayResult;
  notes: string[];
}

export async function previewPay(actor: Actor, input: unknown): Promise<PreviewResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (!(await getService('permissions').can(actor, 'payroll.pay.read', { type: 'employee' })))
    throw new ForbiddenError();
  const parsed = previewInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The preview is not valid.');
  const d = parsed.data;
  const { employee, pay } = await payDetails(companyId, d.employeeId);
  if (!pay) throw new ValidationError('This employee has no pay details yet.');
  const [settings, items, rules] = await Promise.all([
    getPayrollSettings(companyId),
    itemsForStructure(companyId, employee.structureId),
    listTaxRules(companyId, true),
  ]);
  const input2: PayInput = {
    basis: employee.payBasis,
    baseAmount: pay.baseAmount,
    commissionRatePercent: pay.commissionRatePercent,
    period: {
      start: d.periodStart,
      end: d.periodEnd,
      periodsPerYear: PERIODS_PER_YEAR[settings.payFrequency],
    },
    joinDate: employee.joinDate,
    endDate: employee.endDate,
    regularHours: d.regularHours,
    overtimeHours: d.overtimeHours,
    sales: d.sales,
    bonus: d.bonus,
    incentive: d.incentive,
    items,
    settings,
    taxRules: rules,
    ytd: { taxable: '0', gross: '0' },
  };
  const result = calculatePay(input2);
  await getService('audit').record({
    action: 'payroll.preview',
    resourceType: 'employee',
    resourceId: d.employeeId,
    companyId,
    metadata: {
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      gross: result.gross,
      net: result.net,
    },
  });
  return {
    employee: {
      id: employee.id,
      number: employee.number,
      name: `${employee.firstName} ${employee.lastName}`,
    },
    result,
    notes: [
      'This is a preview. Nothing is saved or paid.',
      'The year to date is taken as zero, so caps and thresholds start from the beginning of the year.',
      ...(rules.length === 0
        ? ['No payroll tax rules are active. Add them in the payroll tax settings.']
        : []),
    ],
  };
}
