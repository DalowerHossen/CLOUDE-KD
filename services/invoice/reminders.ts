// path: services/invoice/reminders.ts
// Payment reminders. A ladder of steps (days before or after the due date) sends one e-mail per step per invoice,
// at a polite time: outside quiet hours and, if chosen, on business days, in the company's own time zone. A promise
// to pay or a pause stops reminders until its date. A step that is more than three days late is skipped, so turning the
// ladder on never floods old invoices. Disputed invoices get none.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { invoiceLink } from '@/lib/billing/links';
import { addDays, daysBetween } from '@/lib/invoice/terms';
import {
  DEFAULT_STEPS,
  STAGE_TEXT,
  dueSteps,
  isBusinessDay,
  isQuietHour,
  localHour,
  normalizeSteps,
  stageOf,
} from '@/lib/schedule/reminders';
import { localDay } from '@/lib/schedule/recurrence';
import type { ReminderSettingsInput } from '@/lib/schedule/input';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import type { Actor } from '@/types/contracts';
import { logInvoiceEvent } from './events';
import { getInvoice, type InvoiceView } from './invoices';

export interface ReminderSettingsView extends ReminderSettingsInput {
  version: number;
}

const DEFAULTS: ReminderSettingsView = {
  enabled: false,
  steps: [...DEFAULT_STEPS],
  quietStart: 20,
  quietEnd: 8,
  businessDaysOnly: true,
  ccOwner: false,
  message: '',
  version: 0,
};

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function getReminderSettings(companyId: string): Promise<ReminderSettingsView> {
  const { data, error } = await getAdminSupabase()
    .from('reminder_settings')
    .select(
      'enabled, steps, quiet_start, quiet_end, business_days_only, cc_owner, message, version',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return DEFAULTS;
  return {
    enabled: data.enabled === true,
    steps: normalizeSteps(((data.steps as unknown[]) ?? []).map((n) => toInt(n))),
    quietStart: toInt(data.quiet_start, 20),
    quietEnd: toInt(data.quiet_end, 8),
    businessDaysOnly: data.business_days_only === true,
    ccOwner: data.cc_owner === true,
    message: String(data.message ?? ''),
    version: toInt(data.version, 1),
  };
}

export async function saveReminderSettings(
  actor: Actor,
  input: ReminderSettingsInput,
  expectedVersion: number,
): Promise<ReminderSettingsView> {
  const companyId = need(actor);
  const steps = normalizeSteps(input.steps);
  if (input.enabled && steps.length === 0)
    throw new ValidationError('Add at least one reminder step, or switch reminders off.');
  const admin = getAdminSupabase();
  const columns = {
    enabled: input.enabled,
    steps,
    quiet_start: input.quietStart,
    quiet_end: input.quietEnd,
    business_days_only: input.businessDaysOnly,
    cc_owner: input.ccOwner,
    message: input.message,
    updated_by: actor.userId,
  };
  if (expectedVersion === 0) {
    const r = await admin.from('reminder_settings').insert({ company_id: companyId, ...columns });
    if (r.error) {
      if (r.error.code === '23505') throw new ConflictError();
      throw new InternalError(r.error);
    }
  } else {
    const r = await admin
      .from('reminder_settings')
      .update({ ...columns, version: expectedVersion + 1 })
      .eq('company_id', companyId)
      .eq('version', expectedVersion)
      .is('deleted_at', null)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  }
  await getService('audit').record({
    action: 'reminders.settings_saved',
    resourceType: 'reminder_settings',
    resourceId: companyId,
    companyId,
    metadata: { enabled: input.enabled, steps, by: actor.userId },
  });
  return getReminderSettings(companyId);
}

export interface HoldView {
  id: string;
  kind: 'promise' | 'pause';
  untilDate: string | null;
  note: string;
  active: boolean;
  createdAt: string;
}

export async function listHolds(companyId: string, invoiceId: string): Promise<HoldView[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getAdminSupabase()
    .from('reminder_holds')
    .select('id, kind, until_date, note, released_at, created_at')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as HoldView['kind'],
    untilDate: r.until_date ? String(r.until_date) : null,
    note: String(r.note ?? ''),
    active: r.released_at === null && (r.until_date === null || String(r.until_date) >= today),
    createdAt: String(r.created_at),
  }));
}

export async function addHold(
  actor: Actor,
  invoiceId: string,
  input: { kind: 'promise' | 'pause'; untilDate: string | null; note: string },
): Promise<HoldView[]> {
  const companyId = need(actor);
  const invoice = await getInvoice(companyId, invoiceId);
  if (!['sent', 'viewed', 'partially_paid', 'overdue', 'disputed'].includes(invoice.status))
    throw new ValidationError('Reminders only apply to an invoice that is open.');
  const today = new Date().toISOString().slice(0, 10);
  if (input.untilDate !== null && input.untilDate < today)
    throw new ValidationError('The date cannot be in the past.');
  const r = await getAdminSupabase().from('reminder_holds').insert({
    company_id: companyId,
    invoice_id: invoiceId,
    kind: input.kind,
    until_date: input.untilDate,
    note: input.note,
    created_by: actor.userId,
  });
  if (r.error) throw new InternalError(r.error);
  await logInvoiceEvent(
    companyId,
    invoiceId,
    input.kind === 'promise' ? 'promise_to_pay' : 'reminders_paused',
    input.kind === 'promise'
      ? `Client promised to pay by ${input.untilDate ?? ''}`
      : 'Reminders paused',
    actor.userId,
  );
  return listHolds(companyId, invoiceId);
}

export async function releaseHolds(actor: Actor, invoiceId: string): Promise<HoldView[]> {
  const companyId = need(actor);
  await getInvoice(companyId, invoiceId);
  const r = await getAdminSupabase()
    .from('reminder_holds')
    .update({ released_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('released_at', null)
    .is('deleted_at', null);
  if (r.error) throw new InternalError(r.error);
  await logInvoiceEvent(
    companyId,
    invoiceId,
    'reminders_resumed',
    'Reminders resumed',
    actor.userId,
  );
  return listHolds(companyId, invoiceId);
}

interface ReminderCopy {
  companyId: string;
  invoice: InvoiceView;
  offset: number;
  today: string;
  message: string;
  key: string;
}

async function sendReminderEmail(c: ReminderCopy): Promise<void> {
  const to = c.invoice.billTo.email;
  if (!to) throw new ValidationError('The client has no e-mail address on this invoice.');
  const issued = await getService('tokens').issue({
    docType: 'invoice',
    docId: c.invoice.id,
    companyId: c.companyId,
    ttlDays: 90,
  });
  const seller = (c.invoice.seller ?? {}) as { name?: string };
  const late = daysBetween(c.invoice.dueDate, c.today);
  await getService('email').send({
    template: 'invoice.reminder',
    to,
    companyId: c.companyId,
    data: {
      clientName: c.invoice.billTo.name || c.invoice.walkInName,
      companyName: seller.name ?? '',
      number: c.invoice.number ?? '',
      amountDue: formatMoney(Money.parse(c.invoice.balance)),
      dueDate: c.invoice.dueDate,
      stageText: STAGE_TEXT[stageOf(c.offset)],
      daysLate: String(late > 0 ? late : 0),
      message: c.message,
      link: invoiceLink(issued.token),
    },
    idempotencyKey: c.key,
  });
}

async function logReminder(
  companyId: string,
  invoiceId: string,
  stepKey: string,
  offset: number | null,
  status: 'sent' | 'skipped' | 'failed',
  detail: string,
): Promise<void> {
  const r = await getAdminSupabase().from('reminder_log').insert({
    company_id: companyId,
    invoice_id: invoiceId,
    step_key: stepKey,
    offset_days: offset,
    status,
    detail,
  });
  if (r.error && r.error.code !== '23505') throw new InternalError(r.error);
}

/** Sends a reminder now, whatever the ladder says (a person pressed the button). */
export async function sendReminderNow(
  actor: Actor,
  invoiceId: string,
  message: string,
): Promise<void> {
  const companyId = need(actor);
  const invoice = await getInvoice(companyId, invoiceId);
  if (!['sent', 'viewed', 'partially_paid', 'overdue'].includes(invoice.status))
    throw new ValidationError('A reminder can be sent for an invoice that is open.');
  if (!Money.parse(invoice.balance).isPositive())
    throw new ValidationError('There is nothing left to pay on this invoice.');
  const tz = (await getSection(companyId, 'profile').catch(() => null))?.value.timezone ?? 'UTC';
  const today = localDay(new Date(), tz);
  const offset = Math.max(0, daysBetween(invoice.dueDate, today));
  const stamp = new Date().toISOString().slice(0, 16);
  await sendReminderEmail({
    companyId,
    invoice,
    offset,
    today,
    message,
    key: `reminder-manual-${invoiceId}-${stamp}`,
  });
  await logReminder(companyId, invoiceId, `manual:${stamp}`, offset, 'sent', `By ${actor.userId}`);
  await logInvoiceEvent(
    companyId,
    invoiceId,
    'reminder_sent',
    'Reminder sent by hand',
    actor.userId,
  );
}

export async function listReminderLog(
  companyId: string,
  invoiceId: string,
): Promise<{ stepKey: string; status: string; detail: string; createdAt: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('reminder_log')
    .select('step_key, status, detail, created_at')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    stepKey: String(r.step_key),
    status: String(r.status),
    detail: String(r.detail ?? ''),
    createdAt: String(r.created_at),
  }));
}

const OPEN = ['sent', 'viewed', 'partially_paid', 'overdue'];

async function runCompany(
  companyId: string,
  settings: ReminderSettingsView,
  now: Date,
): Promise<number> {
  const admin = getAdminSupabase();
  const tz = (await getSection(companyId, 'profile').catch(() => null))?.value.timezone ?? 'UTC';
  const today = localDay(now, tz);
  if (isQuietHour(localHour(now, tz), settings.quietStart, settings.quietEnd)) return 0;
  if (settings.businessDaysOnly && !isBusinessDay(today)) return 0;
  const reach = Math.max(0, ...settings.steps.map((s) => -s));
  const { data, error } = await admin
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .in('status', OPEN)
    .in('kind', ['invoice', 'debit_note'])
    .is('deleted_at', null)
    .lte('due_date', addDays(today, reach))
    .order('due_date', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.id));
  if (ids.length === 0) return 0;
  const [logs, holds] = await Promise.all([
    admin
      .from('reminder_log')
      .select('invoice_id, step_key')
      .eq('company_id', companyId)
      .in('invoice_id', ids),
    admin
      .from('reminder_holds')
      .select('invoice_id, until_date')
      .eq('company_id', companyId)
      .in('invoice_id', ids)
      .is('released_at', null)
      .is('deleted_at', null),
  ]);
  if (logs.error) throw new InternalError(logs.error);
  if (holds.error) throw new InternalError(holds.error);
  const logged = new Map<string, Set<string>>();
  for (const l of logs.data ?? []) {
    const set = logged.get(String(l.invoice_id)) ?? new Set<string>();
    set.add(String(l.step_key));
    logged.set(String(l.invoice_id), set);
  }
  const held = new Set<string>();
  for (const h of holds.data ?? [])
    if (h.until_date === null || String(h.until_date) >= today) held.add(String(h.invoice_id));
  let sent = 0;
  for (const id of ids) {
    if (held.has(id)) continue;
    const invoice = await getInvoice(companyId, id);
    if (!Money.parse(invoice.balance).isPositive()) continue;
    const decision = dueSteps(invoice.dueDate, today, settings.steps, logged.get(id) ?? new Set());
    for (const offset of decision.skip)
      await logReminder(companyId, id, String(offset), offset, 'skipped', 'Too late to send');
    if (decision.send === null) continue;
    if (!invoice.billTo.email) {
      await logReminder(
        companyId,
        id,
        String(decision.send),
        decision.send,
        'skipped',
        'No e-mail address',
      );
      continue;
    }
    try {
      await sendReminderEmail({
        companyId,
        invoice,
        offset: decision.send,
        today,
        message: settings.message,
        key: `reminder-${id}-${decision.send}`,
      });
    } catch {
      continue;
    }
    await logReminder(companyId, id, String(decision.send), decision.send, 'sent', '');
    await logInvoiceEvent(
      companyId,
      id,
      'reminder_sent',
      `Reminder sent (day ${decision.send})`,
      null,
    );
    sent += 1;
    if (settings.ccOwner)
      await getService('notification')
        .notify({
          companyId,
          type: 'invoice.reminder_sent',
          title: 'A payment reminder was sent',
          body: `A reminder for invoice ${invoice.number ?? ''} went to the client.`,
          href: `/invoices/${id}`,
        })
        .catch(() => undefined);
  }
  return sent;
}

/** Job (hourly): sends the reminders that are due, company by company. */
export async function runReminders(now: Date = new Date()): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('reminder_settings')
    .select('company_id')
    .eq('enabled', true)
    .is('deleted_at', null)
    .limit(1000);
  if (error) throw new InternalError(error);
  let sent = 0;
  for (const row of data ?? []) {
    const companyId = String(row.company_id);
    const company = await getAdminSupabase()
      .from('companies')
      .select('status')
      .eq('id', companyId)
      .maybeSingle();
    if (company.error || !company.data || company.data.status !== 'active') continue;
    const settings = await getReminderSettings(companyId);
    if (!settings.enabled) continue;
    try {
      sent += await runCompany(companyId, settings, now);
    } catch {
      continue;
    }
  }
  return sent;
}
