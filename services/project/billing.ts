// path: services/project/billing.ts
// Billing project work. A manager picks approved billable time, done milestones and reimbursable expenses and gets a
// draft invoice for the client of the project. Each hour is claimed in the database first, so it is billed once, even if
// two people bill at the same moment. Hourly time can show as one line per entry, day, person or one line in all;
// a rate can be set for the whole invoice; a retainer project bills its fee plus the hours above the included hours;
// a fixed fee project bills by milestone.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { MAX_LINES, type InvoiceInput, type InvoiceLineInput } from '@/lib/invoice/input';
import { blankLine } from '@/lib/invoice/form';
import { hourLines, lineOf, retainerSplit, type Claimed } from '@/lib/project/bill-lines';
import type { BillInput } from '@/lib/project/input';
import { entryAmount } from '@/lib/project/time';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logInvoiceEvent } from '@/services/invoice/events';
import { loadFormData } from '@/services/invoice/form-data';
import { createInvoice, type InvoiceView } from '@/services/invoice/invoices';
import { termsFromDays } from '@/lib/invoice/form';
import { dueDateFor } from '@/lib/invoice/terms';
import type { Actor } from '@/types/contracts';
import { billableExpenseProvider, type BillableExpense } from './expense-hook';
import {
  assertManager,
  getProject,
  listMilestones,
  type MilestoneRow,
  type ProjectView,
} from './projects';

type Row = Record<string, unknown>;

export interface UnbilledEntry {
  id: string;
  workDate: string;
  userId: string;
  userName: string;
  hours: string;
  rate: string;
  amount: string;
  description: string;
}

export interface UnbilledData {
  project: ProjectView;
  entries: UnbilledEntry[];
  milestones: MilestoneRow[];
  expenses: BillableExpense[];
  totalHours: string;
  totalAmount: string;
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function userNames(companyId: string): Promise<Map<string, string>> {
  const { listMembers } = await import('@/services/team/members');
  const team = await listMembers(companyId).catch(() => []);
  return new Map(team.map((m) => [m.userId, m.name || m.email]));
}

/** Approved billable time that no invoice has taken, with the done milestones and expenses that can be billed. */
export async function unbilledForProject(actor: Actor, projectId: string): Promise<UnbilledData> {
  const companyId = need(actor);
  await assertManager(actor, projectId);
  const project = await getProject(companyId, projectId);
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .select('id, work_date, user_id, hours, rate, description')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .eq('billable', true)
    .is('invoice_id', null)
    .is('deleted_at', null)
    .order('work_date', { ascending: true })
    .limit(5000);
  if (error) throw new InternalError(error);
  const names = await userNames(companyId);
  let totalHours = Money.zero();
  let totalAmount = Money.zero();
  const entries: UnbilledEntry[] = (data ?? []).map((r) => {
    const hours = Money.parseRounded(String(r.hours)).toDbString().slice(0, -2);
    const rate = Money.parseRounded(String(r.rate)).toDbString();
    const amount = entryAmount(hours, rate);
    totalHours = totalHours.add(hours);
    totalAmount = totalAmount.add(amount);
    return {
      id: String(r.id),
      workDate: String(r.work_date),
      userId: String(r.user_id),
      userName: names.get(String(r.user_id)) ?? '',
      hours,
      rate,
      amount: amount.toDbString(),
      description: String(r.description ?? ''),
    };
  });
  const milestones = (await listMilestones(companyId, projectId)).filter(
    (m) =>
      m.status === 'done' &&
      m.invoiceId === null &&
      m.amount !== null &&
      Money.parse(m.amount).isPositive(),
  );
  const provider = billableExpenseProvider();
  const expenses = provider ? await provider.list(companyId, projectId).catch(() => []) : [];
  return {
    project,
    entries,
    milestones,
    expenses,
    totalHours: totalHours.toDbString().slice(0, -2),
    totalAmount: totalAmount.toDbString(),
  };
}

export interface UnbilledSummary {
  projectId: string;
  projectName: string;
  clientName: string;
  hours: string;
  amount: string;
  milestones: number;
}

/** One row for each project that has approved time waiting to be billed (projects the person manages). */
export async function unbilledSummary(actor: Actor): Promise<UnbilledSummary[]> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  let q = admin
    .from('time_entries')
    .select('project_id, hours, rate')
    .eq('company_id', companyId)
    .eq('status', 'approved')
    .eq('billable', true)
    .is('invoice_id', null)
    .is('deleted_at', null)
    .limit(20000);
  if (actor.role !== 'owner') {
    const managed = await admin
      .from('project_members')
      .select('project_id')
      .eq('company_id', companyId)
      .eq('user_id', actor.userId)
      .eq('role', 'manager')
      .is('deleted_at', null);
    if (managed.error) throw new InternalError(managed.error);
    const ids = (managed.data ?? []).map((m) => String(m.project_id));
    if (ids.length === 0) return [];
    q = q.in('project_id', ids);
  }
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const sums = new Map<string, { hours: Money; amount: Money }>();
  for (const r of data ?? []) {
    const cell = sums.get(String(r.project_id)) ?? { hours: Money.zero(), amount: Money.zero() };
    cell.hours = cell.hours.add(String(r.hours));
    cell.amount = cell.amount.add(entryAmount(String(r.hours), String(r.rate)));
    sums.set(String(r.project_id), cell);
  }
  const ids = [...sums.keys()];
  if (ids.length === 0) return [];
  const projects = await admin
    .from('projects')
    .select('id, name, client_id')
    .eq('company_id', companyId)
    .in('id', ids)
    .is('deleted_at', null);
  if (projects.error) throw new InternalError(projects.error);
  const clientIds = [
    ...new Set((projects.data ?? []).filter((p) => p.client_id).map((p) => String(p.client_id))),
  ];
  const clients = clientIds.length
    ? await admin.from('clients').select('id, name').eq('company_id', companyId).in('id', clientIds)
    : { data: [], error: null };
  if (clients.error) throw new InternalError(clients.error);
  const clientName = new Map((clients.data ?? []).map((c) => [String(c.id), String(c.name)]));
  const rows = (projects.data ?? []).map((p) => {
    const cell = sums.get(String(p.id)) as { hours: Money; amount: Money };
    return {
      projectId: String(p.id),
      projectName: String(p.name),
      clientName: clientName.get(String(p.client_id)) ?? '',
      hours: cell.hours.toDbString().slice(0, -2),
      amount: cell.amount.toDbString(),
      milestones: 0,
    };
  });
  return rows.sort((a, b) => (Money.parse(b.amount).gt(a.amount) ? 1 : -1));
}

/** Makes a draft invoice from approved time, done milestones and reimbursable expenses of one project. */
export async function createProjectInvoice(
  actor: Actor,
  projectId: string,
  input: BillInput,
): Promise<InvoiceView> {
  const companyId = need(actor);
  await assertManager(actor, projectId);
  const project = await getProject(companyId, projectId);
  if (project.billingType === 'non_billable' || !project.clientId)
    throw new ValidationError('This project is not billed to a client.');
  if (project.billingType === 'fixed' && input.entryIds.length > 0)
    throw new ValidationError('A fixed fee project is billed by milestone, not by the hour.');
  const retainer = project.billingType === 'retainer';
  if (retainer && input.entryIds.length > 0 && input.retainerFrom === null)
    throw new ValidationError('Enter the period of the retainer.');
  const admin = getAdminSupabase();

  // 1. The hours: load, check, claim.
  let claimed: Claimed[] = [];
  if (input.entryIds.length > 0) {
    const { data, error } = await admin
      .from('time_entries')
      .select(
        'id, work_date, user_id, hours, rate, description, billable, status, invoice_id, project_id',
      )
      .eq('company_id', companyId)
      .eq('project_id', projectId)
      .in('id', input.entryIds)
      .is('deleted_at', null);
    if (error) throw new InternalError(error);
    const rows = (data ?? []) as unknown as Row[];
    if (
      rows.length !== input.entryIds.length ||
      rows.some((r) => r.status !== 'approved' || r.billable !== true || r.invoice_id !== null)
    )
      throw new ValidationError(
        'Some of the time is not available to bill any more. Reload and try again.',
      );
    if (
      retainer &&
      rows.some(
        (r) =>
          String(r.work_date) < (input.retainerFrom as string) ||
          String(r.work_date) > (input.retainerTo as string),
      )
    )
      throw new ValidationError('Some of the time is outside the retainer period.');
    const claim = await admin.rpc('kd_time_claim', { p_company: companyId, p_ids: input.entryIds });
    if (claim.error) throw new InternalError(claim.error);
    const got = (claim.data as string[] | null) ?? [];
    if (got.length !== input.entryIds.length) {
      if (got.length > 0)
        await admin.rpc('kd_time_release', { p_company: companyId, p_invoice: null, p_ids: got });
      throw new ValidationError('Someone else billed some of this time. Reload and try again.');
    }
    claimed = rows
      .map((r) => ({
        id: String(r.id),
        workDate: String(r.work_date),
        userId: String(r.user_id),
        hours: Money.parseRounded(String(r.hours)).toDbString().slice(0, -2),
        rate: Money.parseRounded(String(r.rate)).toDbString(),
        description: String(r.description ?? ''),
      }))
      .sort((a, b) => a.workDate.localeCompare(b.workDate));
  }
  let milestones: MilestoneRow[] = [];
  const release = async (): Promise<void> => {
    if (claimed.length > 0)
      await admin.rpc('kd_time_release', {
        p_company: companyId,
        p_invoice: null,
        p_ids: claimed.map((c) => c.id),
      });
    if (milestones.length > 0)
      await admin
        .from('project_milestones')
        .update({ status: 'done' })
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .in(
          'id',
          milestones.map((m) => m.id),
        )
        .eq('status', 'billed')
        .is('invoice_id', null);
  };

  // 2. The milestones: claim by moving them to "billed".
  try {
    if (input.milestoneIds.length > 0) {
      const all = await listMilestones(companyId, projectId);
      milestones = all.filter((m) => input.milestoneIds.includes(m.id));
      if (
        milestones.length !== input.milestoneIds.length ||
        milestones.some(
          (m) =>
            m.status !== 'done' ||
            m.invoiceId !== null ||
            m.amount === null ||
            !Money.parse(m.amount).isPositive(),
        )
      ) {
        milestones = [];
        throw new ValidationError(
          'A milestone is not ready to bill. It must be done, have an amount, and not be billed yet.',
        );
      }
      const got = await admin
        .from('project_milestones')
        .update({ status: 'billed' })
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .in('id', input.milestoneIds)
        .eq('status', 'done')
        .is('invoice_id', null)
        .select('id');
      if (got.error) throw new InternalError(got.error);
      if ((got.data ?? []).length !== input.milestoneIds.length) {
        await admin
          .from('project_milestones')
          .update({ status: 'done' })
          .eq('company_id', companyId)
          .in(
            'id',
            (got.data ?? []).map((m) => String(m.id)),
          )
          .is('invoice_id', null);
        milestones = [];
        throw new ValidationError('Someone else billed a milestone. Reload and try again.');
      }
    }

    // 3. The expenses.
    const provider = billableExpenseProvider();
    let expenses: BillableExpense[] = [];
    if (input.expenseIds.length > 0) {
      if (!provider) throw new ValidationError('Expenses cannot be billed here yet.');
      const available = await provider.list(companyId, projectId);
      expenses = available.filter((e) => input.expenseIds.includes(e.id));
      if (expenses.length !== input.expenseIds.length)
        throw new ValidationError('Some expenses are not available to bill any more.');
    }

    // 4. The lines.
    const today = new Date().toISOString().slice(0, 10);
    const form = await loadFormData(companyId, today);
    const base = blankLine(form.defaultTaxCodes);
    const names = await userNames(companyId);
    const lines: InvoiceLineInput[] = [];
    if (retainer && claimed.length > 0) {
      const { included, over } = retainerSplit(
        claimed.reduce((s, c) => s.add(c.hours), Money.zero()),
        project.retainerHours ?? '0',
      );
      if (project.fixedFee && Money.parse(project.fixedFee).isPositive())
        lines.push(
          lineOf(
            base,
            `${project.name} retainer, ${input.retainerFrom} to ${input.retainerTo} (${included.toDbString().slice(0, -2)} hours included)`,
            '1',
            project.fixedFee,
            'unit',
          ),
        );
      if (over.isPositive()) {
        const rate =
          input.rateOverride ?? project.defaultRate ?? claimed[claimed.length - 1]?.rate ?? '0';
        lines.push(
          lineOf(
            base,
            `${project.name} - additional hours above the retainer`,
            over.toDbString().slice(0, -2),
            rate,
            'hour',
          ),
        );
      }
    } else if (claimed.length > 0) {
      lines.push(
        ...hourLines(base, claimed, input.grouping, input.rateOverride, project.name, names),
      );
    }
    for (const m of milestones)
      lines.push(
        lineOf(base, `${project.name} - milestone: ${m.name}`, '1', m.amount as string, 'unit'),
      );
    for (const e of expenses)
      lines.push(lineOf(base, `Expense ${e.date}: ${e.description}`, '1', e.amount, 'unit'));
    if (lines.length === 0) throw new ValidationError('Nothing to bill. Check the selection.');
    if (lines.length > MAX_LINES)
      throw new ValidationError(
        'That is too many lines for one invoice. Choose "by day" or "one line".',
      );

    const billing = await getService('clients').getBilling(project.clientId);
    const terms = termsFromDays(null);
    const draft: InvoiceInput = {
      ...form.blank,
      kind: 'invoice',
      clientId: project.clientId,
      billTo: {
        ...form.blank.billTo,
        name: billing.name,
        email: billing.email ?? '',
        postalCode: billing.billingPostalCode ?? '',
        country: billing.billingCountry,
      },
      issueDate: today,
      paymentTerms: terms,
      dueDate: dueDateFor(today, terms, null),
      projectId,
      notes: form.blank.notes,
      lines,
    };
    const invoice = await createInvoice(actor, draft);

    // 5. Link everything to the invoice.
    if (claimed.length > 0) {
      const linked = await admin.rpc('kd_time_link', {
        p_company: companyId,
        p_ids: claimed.map((c) => c.id),
        p_invoice: invoice.id,
      });
      if (linked.error) throw new InternalError(linked.error);
    }
    if (milestones.length > 0) {
      const r = await admin
        .from('project_milestones')
        .update({ invoice_id: invoice.id })
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .in(
          'id',
          milestones.map((m) => m.id),
        );
      if (r.error) throw new InternalError(r.error);
    }
    if (expenses.length > 0 && provider)
      await provider.markBilled(
        companyId,
        expenses.map((e) => e.id),
        invoice.id,
      );
    await logInvoiceEvent(
      companyId,
      invoice.id,
      'project_billing',
      `Made from project "${project.name}": ${claimed.length} time entries, ${milestones.length} milestones, ${expenses.length} expenses`,
      actor.userId,
    );
    await getService('audit').record({
      action: 'project.billed',
      resourceType: 'project',
      resourceId: projectId,
      companyId,
      metadata: {
        invoiceId: invoice.id,
        entries: claimed.length,
        milestones: milestones.length,
        expenses: expenses.length,
        by: actor.userId,
      },
    });
    return invoice;
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
}
