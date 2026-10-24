// path: services/taxfiling/filing.ts
// Tax filing records: the provision rate and reminder days, the tax payments made to the authorities, and the deadline calendar.
// The daily job reminds the owner before a deadline and again on the day, once each, until the deadline is marked done.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import {
  deadlineInput,
  deadlineUpdate,
  filingSettingsInput,
  paymentInput,
  reminderStage,
} from './tax-rules';

const log = createLogger({ component: 'tax-filing' });
const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function record(
  companyId: string,
  action: string,
  resourceType: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({ action, resourceType, resourceId: id, companyId, metadata });
}

export interface FilingSettings {
  provisionRate: string;
  reminderDays: number;
  version: number | null;
}

export async function getFilingSettings(companyId: string): Promise<FilingSettings> {
  const { data, error } = await getAdminSupabase()
    .from('tax_filing_settings')
    .select('provision_rate, reminder_days, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return { provisionRate: '0.0000', reminderDays: 7, version: null };
  return {
    provisionRate: Money.parseRounded(String(data.provision_rate)).toDbString(),
    reminderDays: toInt(data.reminder_days),
    version: toInt(data.version),
  };
}

export async function saveFilingSettings(actor: Actor, input: unknown): Promise<FilingSettings> {
  const companyId = need(actor);
  const parsed = filingSettingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const row = {
    provision_rate: parsed.data.provisionRate,
    reminder_days: parsed.data.reminderDays,
  };
  const admin = getAdminSupabase();
  const current = await getFilingSettings(companyId);
  if (current.version === null) {
    const { error } = await admin
      .from('tax_filing_settings')
      .insert({ company_id: companyId, ...row });
    if (error) mapAccountingError(error);
  } else {
    const { data, error } = await admin
      .from('tax_filing_settings')
      .update(row)
      .eq('company_id', companyId)
      .eq('version', parsed.data.version ?? current.version)
      .is('deleted_at', null)
      .select('id');
    if (error) mapAccountingError(error);
    if ((data ?? []).length === 0)
      throw new ConflictError('The settings changed. Reload and try again.');
  }
  await record(companyId, 'tax.settings_saved', 'tax_filing_settings', null, row);
  return getFilingSettings(companyId);
}

export interface PaymentView {
  id: string;
  jurisdiction: string;
  taxKind: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  paidOn: string;
  reference: string;
  note: string;
}

const PAY =
  'id, jurisdiction, tax_kind, period_start, period_end, amount, paid_on, reference, note';

export async function listPayments(
  companyId: string,
  from?: string,
  to?: string,
): Promise<PaymentView[]> {
  let q = getAdminSupabase()
    .from('tax_payments')
    .select(PAY)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('paid_on', { ascending: false })
    .limit(2000);
  if (from) q = q.gte('paid_on', from);
  if (to) q = q.lte('paid_on', to);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    jurisdiction: String(r.jurisdiction),
    taxKind: String(r.tax_kind),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
    paidOn: String(r.paid_on),
    reference: String(r.reference),
    note: String(r.note),
  }));
}

export async function addPayment(actor: Actor, input: unknown): Promise<PaymentView> {
  const companyId = need(actor);
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The payment is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('tax_payments')
    .insert({
      company_id: companyId,
      jurisdiction: d.jurisdiction,
      tax_kind: d.taxKind,
      period_start: d.periodStart,
      period_end: d.periodEnd,
      amount: d.amount,
      paid_on: d.paidOn,
      reference: d.reference,
      note: d.note,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) mapAccountingError(error);
  const id = String((data as { id: string }).id);
  await record(companyId, 'tax.payment_added', 'tax_payment', id, {
    jurisdiction: d.jurisdiction,
    amount: d.amount,
  });
  return (await listPayments(companyId)).find((p) => p.id === id) as PaymentView;
}

export async function removePayment(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('tax_payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'tax.payment_removed', 'tax_payment', id, {});
}

export interface DeadlineView {
  id: string;
  title: string;
  jurisdiction: string;
  dueOn: string;
  status: 'open' | 'done';
  note: string;
  version: number;
}

const DL = 'id, title, jurisdiction, due_on, status, note, version';

interface DeadlineRow {
  id: string;
  title: string;
  jurisdiction: string;
  due_on: string;
  status: string;
  note: string;
  version: number;
}

const deadline = (r: DeadlineRow): DeadlineView => ({
  id: r.id,
  title: r.title,
  jurisdiction: r.jurisdiction,
  dueOn: String(r.due_on),
  status: r.status === 'done' ? 'done' : 'open',
  note: r.note,
  version: r.version,
});

export async function listDeadlines(companyId: string): Promise<DeadlineView[]> {
  const { data, error } = await getAdminSupabase()
    .from('tax_deadlines')
    .select(DL)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('due_on', { ascending: true })
    .limit(1000);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as DeadlineRow[]).map(deadline);
}

export async function addDeadline(actor: Actor, input: unknown): Promise<DeadlineView> {
  const companyId = need(actor);
  const parsed = deadlineInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The deadline is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('tax_deadlines')
    .insert({
      company_id: companyId,
      title: d.title,
      jurisdiction: d.jurisdiction,
      due_on: d.dueOn,
      note: d.note,
      created_by: actor.userId,
    })
    .select(DL)
    .single();
  if (error) mapAccountingError(error);
  const created = deadline(data as unknown as DeadlineRow);
  await record(companyId, 'tax.deadline_added', 'tax_deadline', created.id, { dueOn: d.dueOn });
  return created;
}

export async function updateDeadline(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<DeadlineView> {
  const companyId = need(actor);
  const parsed = deadlineUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.title !== undefined) patch.title = d.title;
  if (d.jurisdiction !== undefined) patch.jurisdiction = d.jurisdiction;
  if (d.dueOn !== undefined) patch.due_on = d.dueOn;
  if (d.note !== undefined) patch.note = d.note;
  if (d.status !== undefined) {
    patch.status = d.status;
    patch.done_at = d.status === 'done' ? new Date().toISOString() : null;
  }
  const { data, error } = await getAdminSupabase()
    .from('tax_deadlines')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(DL);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as DeadlineRow | undefined;
  if (!row) throw new ConflictError('The deadline changed or was removed.');
  await record(companyId, 'tax.deadline_changed', 'tax_deadline', id, {
    fields: Object.keys(patch),
  });
  return deadline(row);
}

export async function removeDeadline(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('tax_deadlines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'tax.deadline_removed', 'tax_deadline', id, {});
}

/** Daily job: sends the reminder of each open deadline once before its date and once on the day. */
export async function runTaxReminders(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ checked: number; sent: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('tax_deadlines')
    .select('id, company_id, title, jurisdiction, due_on, reminded_stage')
    .eq('status', 'open')
    .is('deleted_at', null)
    .lte(
      'due_on',
      new Date(Date.parse(`${today}T00:00:00Z`) + 61 * 86_400_000).toISOString().slice(0, 10),
    )
    .limit(10_000);
  if (error) throw new InternalError(error);
  const out = { checked: 0, sent: 0 };
  const days = new Map<string, number>();
  for (const d of data ?? []) {
    out.checked += 1;
    const company = String(d.company_id);
    if (!days.has(company)) days.set(company, (await getFilingSettings(company)).reminderDays);
    const stage = reminderStage(
      String(d.due_on),
      today,
      days.get(company) ?? 7,
      toInt(d.reminded_stage),
      false,
    );
    if (stage === null) continue;
    try {
      await getService('notification').notify({
        companyId: company,
        type: 'tax.deadline',
        title: stage === 2 ? 'A tax deadline is due' : 'A tax deadline is coming',
        body: `${String(d.title)}${d.jurisdiction ? ` (${String(d.jurisdiction)})` : ''} is due on ${String(d.due_on)}.`,
        href: '/accounting/tax',
      });
      const up = await admin.from('tax_deadlines').update({ reminded_stage: stage }).eq('id', d.id);
      if (up.error) throw new InternalError(up.error);
      out.sent += 1;
    } catch (e) {
      log.error('tax reminder failed', { id: String(d.id), error: String(e) });
    }
  }
  return out;
}
