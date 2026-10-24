// path: services/payroll/runs.ts
// Pay runs. A run is made for a pay period and calculates every employee who was employed in it (hours, sales, bonus and incentive
// are entered per employee and the run is calculated again). The run is submitted, the owner approves it through the approval
// service, and approval fixes the figures, makes the encrypted payslips and publishes `payroll.run_approved` (accounting books the
// salaries and the amounts owed). The owner then pays by bank transfer outside the platform, records the payment, and
// `payroll.run_paid` is published (accounting books the net pay out of the bank). The database refuses to pay an employee twice
// for the same days.
import 'server-only';
import { createElement } from 'react';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { PayslipPdf } from '@/lib/pdf/payslip-pdf';
import { renderPdf } from '@/lib/pdf/pdf-engine';
import { setupFonts } from '@/lib/pdf/shared/fonts';
import { getServerEnv } from '@/lib/env';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { calculatePay, type PayLine } from './calc-rules';
import { listEmployees, payDetails } from './employees';
import { PERIODS_PER_YEAR } from './payroll-rules';
import {
  approvedPayload,
  decideInput,
  deductionsOf,
  itemInput,
  paidPayload,
  payInput,
  payslipOf,
  periodProblem,
  runInput,
  totalsOf,
  transferFile,
  ytdOf,
  type ItemInput,
  type PriorItem,
  type RunTotals,
  type TransferRow,
} from './run-rules';
import { getPayrollSettings, itemsForStructure } from './structures';
import { listTaxRules } from './tax-settings';

const log = createLogger({ component: 'pay-runs' });
export const RUN_APPROVAL_ACTION = 'payroll.run.approve';
const MAX_EMPLOYEES = 2000;

export type RunStatus = 'draft' | 'calculated' | 'submitted' | 'approved' | 'paid';

export interface RunView {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  frequency: string;
  status: RunStatus;
  employeeCount: number;
  gross: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  employerContributions: string;
  employerCost: string;
  errors: { employeeId: string; name: string; message: string }[];
  inputs: Record<string, ItemInput>;
  paidOn: string | null;
  paymentReference: string;
  version: number;
}

export interface ItemView {
  id: string;
  employeeId: string;
  number: string;
  name: string;
  gross: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  employerCost: string;
  warnings: string[];
  lines: PayLine[];
  payslip: boolean;
  paymentStatus: 'unpaid' | 'paid';
}

const RC =
  'id, run_number, period_start, period_end, pay_date, frequency, status, employee_count, gross, employee_taxes, deductions, net, employer_contributions, employer_cost, errors, inputs, paid_on, payment_reference, approval_request_id, event_published_at, paid_event_published_at, version';

interface RunRow {
  id: string;
  run_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  frequency: string;
  status: string;
  employee_count: number;
  gross: string | number;
  employee_taxes: string | number;
  deductions: string | number;
  net: string | number;
  employer_contributions: string | number;
  employer_cost: string | number;
  errors: RunView['errors'] | null;
  inputs: Record<string, ItemInput> | null;
  paid_on: string | null;
  payment_reference: string;
  approval_request_id: string | null;
  event_published_at: string | null;
  paid_event_published_at: string | null;
  version: number;
}

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();
const statusOf = (v: string): RunStatus =>
  v === 'calculated' || v === 'submitted' || v === 'approved' || v === 'paid' ? v : 'draft';

const view = (r: RunRow): RunView => ({
  id: r.id,
  number: r.run_number,
  periodStart: String(r.period_start),
  periodEnd: String(r.period_end),
  payDate: String(r.pay_date),
  frequency: r.frequency,
  status: statusOf(r.status),
  employeeCount: toInt(r.employee_count),
  gross: m(r.gross),
  employeeTaxes: m(r.employee_taxes),
  deductions: m(r.deductions),
  net: m(r.net),
  employerContributions: m(r.employer_contributions),
  employerCost: m(r.employer_cost),
  errors: r.errors ?? [],
  inputs: Object.fromEntries(
    Object.entries(r.inputs ?? {}).filter(([k]) => k !== '__only'),
  ) as Record<string, ItemInput>,
  paidOn: r.paid_on,
  paymentReference: r.payment_reference,
  version: r.version,
});

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function record(
  companyId: string,
  action: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'pay_run',
    resourceId: id,
    companyId,
    metadata,
  });
}

export async function listRuns(companyId: string): Promise<RunView[]> {
  const { data, error } = await getAdminSupabase()
    .from('pay_runs')
    .select(RC)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('period_end', { ascending: false })
    .limit(500);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as RunRow[]).map(view);
}

async function rowOf(companyId: string, id: string): Promise<RunRow> {
  const { data, error } = await getAdminSupabase()
    .from('pay_runs')
    .select(RC)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as RunRow;
}

const IC =
  'id, employee_id, employee_number, employee_name, gross, taxable, employee_taxes, deductions, net, employer_contributions, employer_cost, lines, warnings, payslip_file_id, payment_status';

interface ItemRow {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  gross: string | number;
  taxable: string | number;
  employee_taxes: string | number;
  deductions: string | number;
  net: string | number;
  employer_contributions: string | number;
  employer_cost: string | number;
  lines: PayLine[] | null;
  warnings: string[] | null;
  payslip_file_id: string | null;
  payment_status: string;
}

const itemView = (r: ItemRow): ItemView => ({
  id: r.id,
  employeeId: r.employee_id,
  number: r.employee_number,
  name: r.employee_name,
  gross: m(r.gross),
  employeeTaxes: m(r.employee_taxes),
  deductions: m(r.deductions),
  net: m(r.net),
  employerCost: m(r.employer_cost),
  warnings: r.warnings ?? [],
  lines: r.lines ?? [],
  payslip: r.payslip_file_id !== null,
  paymentStatus: r.payment_status === 'paid' ? 'paid' : 'unpaid',
});

async function itemRows(companyId: string, runId: string): Promise<ItemRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('pay_run_items')
    .select(IC)
    .eq('company_id', companyId)
    .eq('run_id', runId)
    .is('deleted_at', null)
    .order('employee_number')
    .limit(5000);
  if (error) throw new InternalError(error);
  return (data ?? []) as unknown as ItemRow[];
}

export async function getRun(
  companyId: string,
  id: string,
): Promise<{ run: RunView; items: ItemView[] }> {
  const row = await rowOf(companyId, id);
  return { run: view(row), items: (await itemRows(companyId, id)).map(itemView) };
}

export async function createRun(actor: Actor, input: unknown): Promise<RunView> {
  const companyId = need(actor);
  const parsed = runInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The pay run is not valid.');
  const d = parsed.data;
  const settings = await getPayrollSettings(companyId);
  const problem = periodProblem(settings.payFrequency, d.periodStart, d.periodEnd);
  if (problem) throw new ValidationError(problem);
  const { data, error } = await getAdminSupabase()
    .from('pay_runs')
    .insert({
      company_id: companyId,
      period_start: d.periodStart,
      period_end: d.periodEnd,
      pay_date: d.payDate,
      frequency: settings.payFrequency,
      created_by: actor.userId,
      inputs: d.employeeIds && d.employeeIds.length > 0 ? { __only: d.employeeIds } : {},
    })
    .select('id')
    .single();
  if (error) mapAccountingError(error);
  const id = String((data as { id: string }).id);
  await record(companyId, 'payroll.run_created', id, {
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
  });
  return calculateRun(actor, id);
}

/** Employees paid in the run: employed at some time in the period (a terminated employee is paid for the last days). */
async function employeesFor(
  companyId: string,
  run: RunRow,
  only: string[] | null,
): Promise<Awaited<ReturnType<typeof listEmployees>>> {
  const all = await listEmployees(companyId);
  return all
    .filter(
      (e) =>
        e.joinDate <= String(run.period_end) &&
        (e.endDate === null || e.endDate >= String(run.period_start)),
    )
    .filter((e) => e.status !== 'terminated' || e.endDate !== null)
    .filter((e) => only === null || only.includes(e.id))
    .slice(0, MAX_EMPLOYEES);
}

async function priorItems(
  companyId: string,
  ids: readonly string[],
  runId: string,
  year: string,
): Promise<PriorItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getAdminSupabase()
    .from('pay_run_items')
    .select('employee_id, period_end, gross, taxable, run_id, pay_runs!inner(status)')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .neq('run_id', runId)
    .gte('period_end', `${year}-01-01`)
    .in('employee_id', [...ids])
    .in('pay_runs.status', ['approved', 'paid'])
    .limit(50_000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    employeeId: String(r.employee_id),
    periodEnd: String(r.period_end),
    gross: m(r.gross as string | number),
    taxable: m(r.taxable as string | number),
  }));
}

const ONLY = '__only';

/** Calculates the run again from the employees, their pay details and the entered inputs. Allowed until the run is submitted. */
export async function calculateRun(actor: Actor, id: string): Promise<RunView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft' && row.status !== 'calculated')
    throw new ConflictError('Only a draft or calculated run can be calculated again.');
  const admin = getAdminSupabase();
  const stored = (row.inputs ?? {}) as Record<string, unknown>;
  const only = Array.isArray(stored[ONLY]) ? (stored[ONLY] as string[]) : null;
  const inputs = (id2: string): ItemInput => {
    const p = itemInput.safeParse({
      employeeId: id2,
      ...(typeof stored[id2] === 'object' ? (stored[id2] as object) : {}),
    });
    return p.success ? p.data : itemInput.parse({ employeeId: id2 });
  };
  // Clear the earlier items of this run.
  const old = await admin
    .from('pay_run_items')
    .update({ active: false, deleted_at: new Date().toISOString() })
    .eq('run_id', id)
    .is('deleted_at', null);
  if (old.error) mapAccountingError(old.error);
  const [settings, rules, employees] = await Promise.all([
    getPayrollSettings(companyId),
    listTaxRules(companyId, true),
    employeesFor(companyId, row, only),
  ]);
  const prior = await priorItems(
    companyId,
    employees.map((e) => e.id),
    id,
    String(row.period_end).slice(0, 4),
  );
  const errors: RunView['errors'] = [];
  const made: { figures: ReturnType<typeof figuresOf> }[] = [];
  for (const e of employees) {
    const name = `${e.firstName} ${e.lastName}`;
    try {
      const { pay } = await payDetails(companyId, e.id);
      if (!pay) {
        errors.push({ employeeId: e.id, name, message: 'No pay details are set.' });
        continue;
      }
      const inp = inputs(e.id);
      if (
        e.payBasis === 'hourly' &&
        !Money.parse(inp.regularHours).isPositive() &&
        !Money.parse(inp.overtimeHours).isPositive()
      ) {
        errors.push({ employeeId: e.id, name, message: 'Enter the hours worked.' });
        continue;
      }
      const calc = calculatePay({
        basis: e.payBasis,
        baseAmount: pay.baseAmount,
        commissionRatePercent: pay.commissionRatePercent,
        period: {
          start: String(row.period_start),
          end: String(row.period_end),
          periodsPerYear: PERIODS_PER_YEAR[settings.payFrequency],
        },
        joinDate: e.joinDate,
        endDate: e.endDate,
        regularHours: inp.regularHours,
        overtimeHours: inp.overtimeHours,
        sales: inp.sales,
        bonus: inp.bonus,
        incentive: inp.incentive,
        items: await itemsForStructure(companyId, e.structureId),
        settings,
        taxRules: rules,
        ytd: ytdOf(prior, e.id, String(row.period_end)),
      });
      if (Money.parse(calc.gross).isZero()) {
        errors.push({
          employeeId: e.id,
          name,
          message: calc.warnings[0] ?? 'There is nothing to pay.',
        });
        continue;
      }
      if (Money.parse(calc.net).isNegative()) {
        errors.push({
          employeeId: e.id,
          name,
          message: 'The deductions and taxes are more than the gross pay.',
        });
        continue;
      }
      const f = figuresOf(calc);
      const ins = await admin.from('pay_run_items').insert({
        company_id: companyId,
        run_id: id,
        employee_id: e.id,
        employee_number: e.number,
        employee_name: name,
        period_start: row.period_start,
        period_end: row.period_end,
        input: inp,
        lines: calc.lines,
        warnings: calc.warnings,
        gross: f.gross,
        taxable: f.taxable,
        employee_taxes: f.employeeTaxes,
        deductions: f.deductions,
        net: f.net,
        employer_contributions: f.employerContributions,
        employer_cost: f.employerCost,
      });
      if (ins.error) {
        if (ins.error.code === '23505') {
          errors.push({
            employeeId: e.id,
            name,
            message: 'This employee is already paid for part of this period.',
          });
          continue;
        }
        mapAccountingError(ins.error);
      }
      made.push({ figures: f });
    } catch (error) {
      if (error instanceof InternalError) throw error;
      errors.push({
        employeeId: e.id,
        name,
        message: error instanceof Error ? error.message : 'The pay could not be calculated.',
      });
    }
  }
  const t = totalsOf(made.map((x) => x.figures));
  const { data, error } = await admin
    .from('pay_runs')
    .update({
      status: 'calculated',
      employee_count: t.employeeCount,
      gross: t.gross,
      taxable: t.taxable,
      employee_taxes: t.employeeTaxes,
      deductions: t.deductions,
      net: t.net,
      employer_contributions: t.employerContributions,
      employer_cost: t.employerCost,
      errors,
      calculated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['draft', 'calculated'])
    .select(RC);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as RunRow | undefined;
  if (!updated) throw new ConflictError('Someone else changed this pay run.');
  await record(companyId, 'payroll.run_calculated', id, {
    employees: t.employeeCount,
    gross: t.gross,
    net: t.net,
    errors: errors.length,
  });
  return view(updated);
}

function figuresOf(calc: ReturnType<typeof calculatePay>): {
  gross: string;
  taxable: string;
  employeeTaxes: string;
  deductions: string;
  net: string;
  employerContributions: string;
  employerCost: string;
} {
  return {
    gross: calc.gross,
    taxable: calc.taxableIncome,
    employeeTaxes: calc.employeeTaxes,
    deductions: deductionsOf(calc.preTaxDeductions, calc.postTaxDeductions),
    net: calc.net,
    employerContributions: calc.employerContributions,
    employerCost: calc.employerCost,
  };
}

/** Enters the hours, sales, bonus and incentive of one employee and calculates the run again. */
export async function setInputs(actor: Actor, id: string, input: unknown): Promise<RunView> {
  const companyId = need(actor);
  const parsed = itemInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The inputs are not valid.');
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft' && row.status !== 'calculated')
    throw new ConflictError('The inputs of a submitted run cannot change.');
  const next = { ...(row.inputs ?? {}), [parsed.data.employeeId]: parsed.data };
  const { error } = await getAdminSupabase()
    .from('pay_runs')
    .update({ inputs: next })
    .eq('id', id)
    .in('status', ['draft', 'calculated']);
  if (error) mapAccountingError(error);
  return calculateRun(actor, id);
}

export async function deleteRun(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft' && row.status !== 'calculated')
    throw new ConflictError('Only a draft or calculated run can be deleted.');
  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  const items = await admin
    .from('pay_run_items')
    .update({ active: false, deleted_at: now })
    .eq('run_id', id)
    .is('deleted_at', null);
  if (items.error) mapAccountingError(items.error);
  const { error } = await admin
    .from('pay_runs')
    .update({ deleted_at: now })
    .eq('id', id)
    .in('status', ['draft', 'calculated']);
  if (error) mapAccountingError(error);
  await record(companyId, 'payroll.run_deleted', id, {});
}

export async function submitRun(actor: Actor, id: string): Promise<RunView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'calculated') throw new ConflictError('Calculate the run first.');
  if (toInt(row.employee_count) === 0)
    throw new ValidationError('The run has no employees to pay.');
  const state = await getService('approval').request({
    action: RUN_APPROVAL_ACTION,
    payload: { runId: id, net: m(row.net), employees: toInt(row.employee_count) },
    requesterId: actor.userId,
    companyId,
  });
  const { data, error } = await getAdminSupabase()
    .from('pay_runs')
    .update({
      status: 'submitted',
      submitted_by: actor.userId,
      submitted_at: new Date().toISOString(),
      approval_request_id: state.requestId,
    })
    .eq('id', id)
    .eq('status', 'calculated')
    .select(RC);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as RunRow | undefined;
  if (!updated) throw new ConflictError('Someone else changed this pay run.');
  await record(companyId, 'payroll.run_submitted', id, { net: m(row.net) });
  return view(updated);
}

function totalsOfRow(r: RunRow): RunTotals {
  return {
    employeeCount: toInt(r.employee_count),
    gross: m(r.gross),
    taxable: '0.0000',
    employeeTaxes: m(r.employee_taxes),
    deductions: m(r.deductions),
    net: m(r.net),
    employerContributions: m(r.employer_contributions),
    employerCost: m(r.employer_cost),
  };
}

/** Publishes `payroll.run_approved` once; the daily job publishes it again if this call stopped before it was done. */
export async function publishApproved(companyId: string, row: RunRow): Promise<void> {
  await getService('events').publish({
    name: 'payroll.run_approved',
    companyId,
    payload: approvedPayload(row.id, String(row.period_end), totalsOfRow(row)),
  });
  const { error } = await getAdminSupabase()
    .from('pay_runs')
    .update({ event_published_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) log.error('event time not saved', { id: row.id, error: error.message });
}

export async function decideRun(actor: Actor, id: string, input: unknown): Promise<RunView> {
  const companyId = need(actor);
  if (actor.role === 'staff') throw new ForbiddenError();
  const parsed = decideInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The decision is not valid.');
  const d = parsed.data;
  const row = await rowOf(companyId, id);
  if (row.status !== 'submitted')
    throw new ConflictError('This run is not waiting for a decision.');
  if (row.approval_request_id)
    await getService('approval').decide(row.approval_request_id, {
      approverId: actor.userId,
      decision: d.decision,
      reason: d.reason || null,
    });
  const admin = getAdminSupabase();
  if (d.decision === 'reject') {
    const r = await admin
      .from('pay_runs')
      .update({ status: 'draft' })
      .eq('id', id)
      .eq('status', 'submitted')
      .select(RC);
    if (r.error) mapAccountingError(r.error);
    await record(companyId, 'payroll.run_rejected', id, { reason: d.reason });
    return view((r.data ?? [])[0] as unknown as RunRow);
  }
  const { data, error } = await admin
    .from('pay_runs')
    .update({
      status: 'approved',
      approved_by: actor.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'submitted')
    .select(RC);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as RunRow | undefined;
  if (!updated) throw new ConflictError('Someone else decided this pay run.');
  await record(companyId, 'payroll.run_approved', id, {
    net: m(updated.net),
    employees: toInt(updated.employee_count),
  });
  await generatePayslips(companyId, id).catch((e: unknown) =>
    log.error('payslips not made', { id, error: String(e) }),
  );
  await publishApproved(companyId, updated).catch((e: unknown) =>
    log.error('event not published', { id, error: String(e) }),
  );
  return view(updated);
}

async function drawPayslip(
  company: string,
  row: RunRow,
  i: ItemRow,
  ytdGross: string,
  ytdNet: string,
): Promise<{ bytes: Uint8Array; sha256: string }> {
  setupFonts(getServerEnv().PDF_FONT_DIR);
  const data = payslipOf(
    company,
    {
      runNumber: row.run_number,
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      payDate: String(row.pay_date),
    },
    {
      employeeName: i.employee_name,
      employeeNumber: i.employee_number,
      lines: i.lines ?? [],
      gross: m(i.gross),
      taxable: m(i.taxable),
      employeeTaxes: m(i.employee_taxes),
      deductions: m(i.deductions),
      net: m(i.net),
      employerContributions: m(i.employer_contributions),
      employerCost: m(i.employer_cost),
    },
    { gross: ytdGross, net: ytdNet },
  );
  return renderPdf(createElement(PayslipPdf, { data }) as Parameters<typeof renderPdf>[0]);
}

/** The payslip of one item drawn again from its stored figures (for the PDF contract). */
export async function renderPayslipPdf(companyId: string, itemId: string): Promise<Uint8Array> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('pay_run_items')
    .select('run_id')
    .eq('company_id', companyId)
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) throw new NotFoundError();
  const row = await rowOf(companyId, String(found.data.run_id));
  if (row.status !== 'approved' && row.status !== 'paid')
    throw new ConflictError('A payslip exists once the run is approved.');
  const item = (await itemRows(companyId, row.id)).find((x) => x.id === itemId);
  if (!item) throw new NotFoundError();
  const company = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  const year = String(row.period_end).slice(0, 4);
  const prior = await priorItems(companyId, [item.employee_id], row.id, year);
  const net = await priorNet(companyId, [item.employee_id], row.id, String(row.period_end));
  const ytd = ytdOf(prior, item.employee_id, String(row.period_end));
  const pdf = await drawPayslip(
    String(company.data?.name ?? ''),
    row,
    item,
    ytd.gross,
    net.get(item.employee_id) ?? '0.0000',
  );
  return pdf.bytes;
}

/** Makes the encrypted payslip of every item that has none yet (safe to run again). */
export async function generatePayslips(companyId: string, runId: string): Promise<number> {
  const admin = getAdminSupabase();
  const row = await rowOf(companyId, runId);
  if (row.status !== 'approved' && row.status !== 'paid')
    throw new ConflictError('Payslips are made when the run is approved.');
  const company = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  const name = String(company.data?.name ?? '');
  const items = (await itemRows(companyId, runId)).filter((i) => i.payslip_file_id === null);
  if (items.length === 0) return 0;
  const prior = await priorItems(
    companyId,
    items.map((i) => i.employee_id),
    runId,
    String(row.period_end).slice(0, 4),
  );
  const net = await priorNet(
    companyId,
    items.map((i) => i.employee_id),
    runId,
    String(row.period_end),
  );
  let made = 0;
  for (const i of items) {
    const pdf = await drawPayslip(
      name,
      row,
      i,
      ytdOf(prior, i.employee_id, String(row.period_end)).gross,
      net.get(i.employee_id) ?? '0.0000',
    );
    const file = await getService('storage').put({
      companyId,
      category: 'payslip',
      name: `payslip-${i.employee_number}-${String(row.period_end)}.pdf`,
      bytes: pdf.bytes,
      mimeType: 'application/pdf',
    });
    const up = await admin
      .from('pay_run_items')
      .update({
        payslip_file_id: file.id,
        payslip_sha256: pdf.sha256,
        payslip_at: new Date().toISOString(),
      })
      .eq('id', i.id);
    if (up.error) throw new InternalError(up.error);
    made += 1;
  }
  await record(companyId, 'payroll.payslips_made', runId, { count: made });
  return made;
}

async function priorNet(
  companyId: string,
  ids: readonly string[],
  runId: string,
  periodEnd: string,
): Promise<Map<string, string>> {
  const { data, error } = await getAdminSupabase()
    .from('pay_run_items')
    .select('employee_id, net, period_end, pay_runs!inner(status)')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .neq('run_id', runId)
    .gte('period_end', `${periodEnd.slice(0, 4)}-01-01`)
    .lt('period_end', periodEnd)
    .in('employee_id', [...ids])
    .in('pay_runs.status', ['approved', 'paid'])
    .limit(50_000);
  if (error) throw new InternalError(error);
  const out = new Map<string, Money>();
  for (const r of data ?? [])
    out.set(
      String(r.employee_id),
      (out.get(String(r.employee_id)) ?? Money.zero()).add(m(r.net as string | number)),
    );
  return new Map([...out].map(([k, v]) => [k, v.toDbString()]));
}

/** A short-lived link to the encrypted payslip of an item. Every opening is audited. */
export async function payslipLink(actor: Actor, itemId: string): Promise<string> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('pay_run_items')
    .select('payslip_file_id, employee_id, run_id')
    .eq('company_id', companyId)
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || !data.payslip_file_id) throw new NotFoundError();
  await getService('audit').record({
    action: 'payroll.payslip_opened',
    resourceType: 'employee',
    resourceId: String(data.employee_id),
    companyId,
    metadata: { runId: String(data.run_id), itemId },
  });
  return getService('storage').signedUrl(String(data.payslip_file_id), 300);
}

/** The bank transfer list of an approved run. Needs the pay permission and a fresh identity check at the route; audited. */
export async function paymentFile(
  actor: Actor,
  id: string,
): Promise<{ csv: string; total: string; missing: string[] }> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'approved')
    throw new ConflictError('The transfer list is made for an approved run that is not paid yet.');
  const rows: TransferRow[] = [];
  const missing: string[] = [];
  for (const i of await itemRows(companyId, id)) {
    const { bank } = await payDetails(companyId, i.employee_id);
    if (!bank) {
      missing.push(`${i.employee_number} ${i.employee_name}`);
      continue;
    }
    rows.push({
      number: i.employee_number,
      holder: bank.holder,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      routingCode: bank.routingCode,
      amount: m(i.net),
    });
  }
  const file = transferFile(row.run_number, rows);
  await record(companyId, 'payroll.payment_file_made', id, {
    lines: rows.length,
    missing: missing.length,
    total: file.total,
  });
  return { csv: file.csv, total: file.total, missing };
}

/** Records that the owner paid the run by bank transfer. Publishes `payroll.run_paid` and tells the employees. */
export async function markPaid(actor: Actor, id: string, input: unknown): Promise<RunView> {
  const companyId = need(actor);
  const parsed = payInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The payment is not valid.');
  const d = parsed.data;
  const row = await rowOf(companyId, id);
  if (row.status !== 'approved')
    throw new ConflictError('Only an approved run can be marked as paid.');
  if (d.paidOn < String(row.period_start))
    throw new ValidationError('The payment date cannot be before the period starts.');
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('pay_runs')
    .update({
      status: 'paid',
      paid_by: actor.userId,
      paid_at: new Date().toISOString(),
      paid_on: d.paidOn,
      payment_method: 'bank_transfer',
      payment_reference: d.reference,
    })
    .eq('id', id)
    .eq('status', 'approved')
    .select(RC);
  if (error) mapAccountingError(error);
  const updated = (data ?? [])[0] as unknown as RunRow | undefined;
  if (!updated) throw new ConflictError('Someone else recorded this payment.');
  const items = await admin
    .from('pay_run_items')
    .update({ payment_status: 'paid', paid_on: d.paidOn })
    .eq('run_id', id)
    .is('deleted_at', null);
  if (items.error) mapAccountingError(items.error);
  await record(companyId, 'payroll.run_paid', id, {
    net: m(updated.net),
    paidOn: d.paidOn,
    reference: d.reference,
  });
  await publishPaid(companyId, updated).catch((e: unknown) =>
    log.error('paid event not published', { id, error: String(e) }),
  );
  await notifyEmployees(companyId, id, updated).catch((e: unknown) =>
    log.error('employee notices failed', { id, error: String(e) }),
  );
  return view(updated);
}

export async function publishPaid(companyId: string, row: RunRow): Promise<void> {
  await getService('events').publish({
    name: 'payroll.run_paid',
    companyId,
    payload: paidPayload(row.id, m(row.net), String(row.paid_on)),
  });
  const { error } = await getAdminSupabase()
    .from('pay_runs')
    .update({ paid_event_published_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) log.error('paid event time not saved', { id: row.id, error: error.message });
}

/** An e-mail to each paid employee: the pay for the period was paid (no amounts in the mail). */
async function notifyEmployees(companyId: string, runId: string, row: RunRow): Promise<void> {
  const admin = getAdminSupabase();
  const company = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  const items = (await itemRows(companyId, runId)).filter((i) => i.payment_status === 'paid');
  for (const i of items) {
    const emp = await admin
      .from('employees')
      .select('first_name, email')
      .eq('id', i.employee_id)
      .maybeSingle();
    if (!emp.data) continue;
    try {
      await getService('email').enqueue({
        template: 'payroll.pay-notice',
        to: String(emp.data.email),
        companyId,
        idempotencyKey: `payroll-notice:${i.id}`,
        data: {
          firstName: String(emp.data.first_name),
          companyName: String(company.data?.name ?? ''),
          periodStart: String(row.period_start),
          periodEnd: String(row.period_end),
          paidOn: String(row.paid_on),
        },
      });
      await admin
        .from('pay_run_items')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', i.id);
    } catch (e) {
      log.error('pay notice not queued', { itemId: i.id, error: String(e) });
    }
  }
}

/** Daily job: publishes events that were missed and makes payslips that are missing for approved and paid runs. */
export async function repairRuns(): Promise<{ events: number; payslips: number }> {
  const admin = getAdminSupabase();
  const out = { events: 0, payslips: 0 };
  const { data, error } = await admin
    .from('pay_runs')
    .select(RC + ', company_id')
    .in('status', ['approved', 'paid'])
    .is('deleted_at', null)
    .or('event_published_at.is.null,paid_event_published_at.is.null')
    .limit(500);
  if (error) throw new InternalError(error);
  for (const r of (data ?? []) as unknown as (RunRow & { company_id: string })[]) {
    try {
      if (r.event_published_at === null) {
        await publishApproved(r.company_id, r);
        out.events += 1;
      }
      if (r.status === 'paid' && r.paid_event_published_at === null) {
        await publishPaid(r.company_id, r);
        out.events += 1;
      }
      out.payslips += await generatePayslips(r.company_id, r.id);
    } catch (e) {
      log.error('pay run repair failed', { id: r.id, error: String(e) });
    }
  }
  const missing = await admin
    .from('pay_run_items')
    .select('run_id, company_id, pay_runs!inner(status)')
    .is('payslip_file_id', null)
    .is('deleted_at', null)
    .eq('active', true)
    .in('pay_runs.status', ['approved', 'paid'])
    .limit(1000);
  if (missing.error) throw new InternalError(missing.error);
  const runs = new Map((missing.data ?? []).map((r) => [String(r.run_id), String(r.company_id)]));
  for (const [runId, companyId] of runs) {
    try {
      out.payslips += await generatePayslips(companyId, runId);
    } catch (e) {
      log.error('payslip repair failed', { id: runId, error: String(e) });
    }
  }
  return out;
}
