// path: services/invoice/installments.ts
// Installment plans of a sent invoice: an even split (with an optional down payment) or dates and amounts typed by
// hand. The parts must add up to the amount due. The status of each part follows the money paid so far.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  installmentStatuses,
  planProblems,
  splitInstallments,
  type InstallmentRow,
  type InstallmentStatus,
} from '@/lib/schedule/installments';
import type { InstallmentPlanInput } from '@/lib/schedule/input';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { logInvoiceEvent } from './events';
import { getInvoice } from './invoices';

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function listInstallments(
  companyId: string,
  invoiceId: string,
): Promise<InstallmentStatus[]> {
  const invoice = await getInvoice(companyId, invoiceId, { includeTrashed: true });
  const { data, error } = await getAdminSupabase()
    .from('installments')
    .select('number, due_date, amount')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('number', { ascending: true })
    .limit(60);
  if (error) throw new InternalError(error);
  const rows: InstallmentRow[] = (data ?? []).map((r) => ({
    number: toInt(r.number),
    dueDate: String(r.due_date),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
  }));
  return installmentStatuses(rows, invoice.amountPaid, new Date().toISOString().slice(0, 10));
}

/** Builds the parts of a plan from the form input, for the preview and for saving. */
export function rowsOf(input: InstallmentPlanInput, total: string): InstallmentRow[] {
  if (input.mode === 'custom')
    return input.rows.map((r, i) => ({
      number: i + 1,
      dueDate: r.dueDate,
      amount: Money.parse(r.amount).toDbString(),
    }));
  return splitInstallments({
    total,
    count: input.count,
    firstDue: input.firstDue,
    unit: input.unit,
    every: input.every,
    downPaymentPercent: input.downPaymentPercent,
  });
}

export async function previewPlan(
  companyId: string,
  invoiceId: string,
  input: InstallmentPlanInput,
): Promise<{ rows: InstallmentRow[]; problems: string[] }> {
  const invoice = await getInvoice(companyId, invoiceId);
  const rows = rowsOf(input, invoice.totals.amountDue);
  return { rows, problems: planProblems(rows, invoice.totals.amountDue, invoice.issueDate) };
}

export async function savePlan(
  actor: Actor,
  invoiceId: string,
  input: InstallmentPlanInput,
): Promise<InstallmentStatus[]> {
  const companyId = need(actor);
  const invoice = await getInvoice(companyId, invoiceId);
  const rows = rowsOf(input, invoice.totals.amountDue);
  const problems = planProblems(rows, invoice.totals.amountDue, invoice.issueDate);
  if (problems.length > 0) throw new ValidationError(problems[0] ?? 'The plan is not valid.');
  const { error } = await getAdminSupabase().rpc('kd_installments_replace', {
    p_company: companyId,
    p_invoice: invoiceId,
    p_rows: rows.map((r) => ({ dueDate: r.dueDate, amount: r.amount })),
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError(
        error.message.includes('not open')
          ? 'An installment plan can be made for an invoice that was sent and is not paid.'
          : 'The plan is not valid.',
      );
    throw new InternalError(error);
  }
  await logInvoiceEvent(
    companyId,
    invoiceId,
    'installments',
    `Installment plan of ${rows.length} parts saved`,
    actor.userId,
  );
  await getService('audit').record({
    action: 'invoice.installments_saved',
    resourceType: 'invoice',
    resourceId: invoiceId,
    companyId,
    metadata: { parts: rows.length, by: actor.userId },
  });
  return listInstallments(companyId, invoiceId);
}

export async function removePlan(actor: Actor, invoiceId: string): Promise<void> {
  const companyId = need(actor);
  await getInvoice(companyId, invoiceId);
  const admin = getAdminSupabase();
  const gone = await admin
    .from('installments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .select('id');
  if (gone.error) throw new InternalError(gone.error);
  if (!gone.data || gone.data.length === 0) throw new NotFoundError();
  const plan = await admin
    .from('installment_plans')
    .update({ status: 'replaced', deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (plan.error) throw new InternalError(plan.error);
  await logInvoiceEvent(
    companyId,
    invoiceId,
    'installments_removed',
    'Installment plan removed',
    actor.userId,
  );
  await getService('audit').record({
    action: 'invoice.installments_removed',
    resourceType: 'invoice',
    resourceId: invoiceId,
    companyId,
    metadata: { by: actor.userId },
  });
}
