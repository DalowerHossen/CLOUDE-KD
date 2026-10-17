// path: services/invoice/recurring.ts
// Recurring invoices. A schedule copies an invoice template on a calendar rule. A job makes every invoice that is due:
// the occurrence is claimed in the database first (so it is never made twice), the invoice is made (and sent when the
// schedule says so and the owner created it), and the schedule moves to its next date. Failures are retried by the next
// run of the job; after three in a row the schedule pauses and the owner is told.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { dueDateFor } from '@/lib/invoice/terms';
import type { InvoiceInput } from '@/lib/invoice/input';
import {
  fillPlaceholders,
  localDay,
  occurrenceDate,
  previewDates,
  withinEnd,
  type Recurrence,
} from '@/lib/schedule/recurrence';
import type { RecurringInput } from '@/lib/schedule/input';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSection } from '@/services/company/settings';
import { createInvoice, getInvoice } from '@/services/invoice/invoices';
import { logInvoiceEvent } from '@/services/invoice/events';
import { sendInvoice } from '@/services/invoice/send';
import type { Actor } from '@/types/contracts';

type Row = Record<string, unknown>;
const PAUSE_AFTER = 3;
const MAX_CATCH_UP = 3;

export interface ScheduleView {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  template: InvoiceInput;
  unit: Recurrence['unit'];
  every: number;
  monthEnd: boolean;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  occurrencesDone: number;
  status: 'active' | 'paused' | 'ended';
  autoSend: boolean;
  sendMessage: string;
  nextRunDate: string | null;
  lastRunOn: string | null;
  lastInvoiceId: string | null;
  failureCount: number;
  lastError: string;
  upcoming: string[];
  version: number;
  createdAt: string;
}

const COLUMNS =
  'id, client_id, name, template, unit, every, month_end, start_date, end_date, max_occurrences, occurrences_done, status, auto_send, send_message, next_run_date, last_run_on, last_invoice_id, failure_count, last_error, version, created_at';

function recurrenceOf(
  r: Pick<ScheduleView, 'unit' | 'every' | 'monthEnd' | 'startDate'>,
): Recurrence {
  return { unit: r.unit, every: r.every, monthEnd: r.monthEnd, startDate: r.startDate };
}

export function toScheduleView(r: Row): ScheduleView {
  const template = r.template as InvoiceInput;
  const v: ScheduleView = {
    id: String(r.id),
    name: String(r.name),
    clientId: String(r.client_id),
    clientName: template.billTo?.name ?? '',
    template,
    unit: String(r.unit) as ScheduleView['unit'],
    every: toInt(r.every, 1),
    monthEnd: r.month_end === true,
    startDate: String(r.start_date),
    endDate: r.end_date ? String(r.end_date) : null,
    maxOccurrences: r.max_occurrences === null ? null : toInt(r.max_occurrences),
    occurrencesDone: toInt(r.occurrences_done),
    status: String(r.status) as ScheduleView['status'],
    autoSend: r.auto_send === true,
    sendMessage: String(r.send_message ?? ''),
    nextRunDate: r.next_run_date ? String(r.next_run_date) : null,
    lastRunOn: r.last_run_on ? String(r.last_run_on) : null,
    lastInvoiceId: r.last_invoice_id ? String(r.last_invoice_id) : null,
    failureCount: toInt(r.failure_count),
    lastError: String(r.last_error ?? ''),
    upcoming: [],
    version: toInt(r.version, 1),
    createdAt: String(r.created_at),
  };
  if (v.status !== 'ended') {
    const rule = recurrenceOf(v);
    const end = { endDate: v.endDate, maxOccurrences: v.maxOccurrences };
    v.upcoming = previewDates(rule, v.occurrencesDone, 5).filter((_, i) =>
      withinEnd(rule, end, v.occurrencesDone + i),
    );
  }
  return v;
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export async function getSchedule(companyId: string, id: string): Promise<ScheduleView> {
  const { data, error } = await getAdminSupabase()
    .from('recurring_schedules')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toScheduleView(data as unknown as Row);
}

export async function listSchedules(companyId: string): Promise<ScheduleView[]> {
  const { data, error } = await getAdminSupabase()
    .from('recurring_schedules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toScheduleView(r as unknown as Row));
}

function columnsOf(input: RecurringInput): Record<string, unknown> {
  const rule: Recurrence = {
    unit: input.unit,
    every: input.every,
    monthEnd: input.monthEnd,
    startDate: input.startDate,
  };
  const end = { endDate: input.endDate, maxOccurrences: input.maxOccurrences };
  return {
    name: input.name,
    client_id: input.template.clientId,
    template: input.template,
    unit: input.unit,
    every: input.every,
    month_end: input.monthEnd,
    start_date: input.startDate,
    end_date: input.endDate,
    max_occurrences: input.maxOccurrences,
    send_message: input.sendMessage,
    next_run_date: withinEnd(rule, end, 0) ? input.startDate : null,
  };
}

function checkRights(actor: Actor, input: RecurringInput): void {
  if (input.autoSend && actor.role !== 'owner')
    throw new ValidationError('Only the owner can set a schedule to send invoices by itself.');
}

export async function createSchedule(actor: Actor, input: RecurringInput): Promise<ScheduleView> {
  const companyId = need(actor);
  checkRights(actor, input);
  if (input.template.clientId) await getService('clients').getById(input.template.clientId);
  const { data, error } = await getAdminSupabase()
    .from('recurring_schedules')
    .insert({
      company_id: companyId,
      created_by: actor.userId,
      auto_send: input.autoSend,
      ...columnsOf(input),
      status: 'active',
    })
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  const view = toScheduleView(data as unknown as Row);
  await getService('audit').record({
    action: 'recurring.created',
    resourceType: 'recurring_schedule',
    resourceId: view.id,
    companyId,
    metadata: { by: actor.userId, autoSend: input.autoSend },
  });
  return view;
}

export async function updateSchedule(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: RecurringInput,
): Promise<ScheduleView> {
  const companyId = need(actor);
  checkRights(actor, input);
  const current = await getSchedule(companyId, id);
  if (current.status === 'ended') throw new ValidationError('An ended schedule cannot be changed.');
  if (input.template.clientId) await getService('clients').getById(input.template.clientId);
  // The calendar rule of a schedule that already ran cannot move: the dates already made would no longer fit.
  if (
    current.occurrencesDone > 0 &&
    (input.unit !== current.unit ||
      input.every !== current.every ||
      input.monthEnd !== current.monthEnd ||
      input.startDate !== current.startDate)
  )
    throw new ValidationError(
      'The repeat rule of a schedule that already ran cannot be changed. End it and start a new one.',
    );
  const cols = columnsOf(input);
  if (current.occurrencesDone > 0) {
    const rule = recurrenceOf(current);
    cols.next_run_date = withinEnd(
      rule,
      { endDate: input.endDate, maxOccurrences: input.maxOccurrences },
      current.occurrencesDone,
    )
      ? occurrenceDate(rule, current.occurrencesDone)
      : null;
  }
  const { data, error } = await getAdminSupabase()
    .from('recurring_schedules')
    .update({ ...cols, auto_send: input.autoSend, version: expectedVersion + 1 })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new ConflictError();
  await getService('audit').record({
    action: 'recurring.updated',
    resourceType: 'recurring_schedule',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return toScheduleView(data[0] as unknown as Row);
}

export async function setScheduleStatus(
  actor: Actor,
  id: string,
  action: 'pause' | 'resume' | 'end',
): Promise<ScheduleView> {
  const companyId = need(actor);
  const current = await getSchedule(companyId, id);
  if (current.status === 'ended') throw new ValidationError('This schedule has ended.');
  const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'ended';
  const patch: Record<string, unknown> = { status, version: current.version + 1 };
  if (action === 'resume') {
    patch.failure_count = 0;
    patch.last_error = '';
  }
  if (action === 'end') patch.next_run_date = null;
  const r = await getAdminSupabase()
    .from('recurring_schedules')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await getService('audit').record({
    action: `recurring.${action}`,
    resourceType: 'recurring_schedule',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getSchedule(companyId, id);
}

export async function trashSchedule(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const current = await getSchedule(companyId, id);
  if (current.status === 'active') throw new ValidationError('Pause or end the schedule first.');
  const r = await getAdminSupabase()
    .from('recurring_schedules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .neq('status', 'active')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  await getService('audit').record({
    action: 'recurring.deleted',
    resourceType: 'recurring_schedule',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

/** The actor a schedule works as. Only a schedule made by the owner may send by itself. */
function actorOf(s: Row, companyId: string): Actor {
  return {
    userId: String(s.created_by),
    role: s.auto_send === true ? 'owner' : 'staff',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'recurring',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}

function templateFor(s: ScheduleView, runDate: string, occurrence: number): InvoiceInput {
  const t = s.template;
  const terms = t.paymentTerms;
  return {
    ...t,
    kind: 'invoice',
    issueDate: runDate,
    dueDate: dueDateFor(runDate, terms, terms === 'custom' ? runDate : null),
    notes: fillPlaceholders(t.notes, runDate, occurrence),
    lines: t.lines.map((l) => ({
      ...l,
      description: fillPlaceholders(l.description, runDate, occurrence),
    })),
  };
}

export interface RunResult {
  invoiceId: string | null;
  sent: boolean;
  note: string;
}

async function runClaimed(
  companyId: string,
  scheduleId: string,
  runId: string,
  index: number,
  runDate: string,
): Promise<RunResult> {
  const admin = getAdminSupabase();
  const { data: raw, error } = await admin
    .from('recurring_schedules')
    .select(`${COLUMNS}, created_by`)
    .eq('id', scheduleId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error || !raw) throw new InternalError(error ?? new Error('Schedule missing.'));
  const row = raw as unknown as Row;
  const schedule = toScheduleView(row);
  const actor = actorOf(row, companyId);
  // A retry after a crash finds the invoice the first try made.
  const existing = await admin
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('recurring_run_id', runId)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const invoiceId = existing.data
    ? String(existing.data.id)
    : (
        await createInvoice(actor, templateFor(schedule, runDate, index + 1), {
          recurringRunId: runId,
        })
      ).id;
  if (!existing.data) {
    await logInvoiceEvent(
      companyId,
      invoiceId,
      'recurring',
      `Made by schedule "${schedule.name}"`,
      null,
    );
  }
  let sent = false;
  let note = '';
  if (schedule.autoSend) {
    try {
      const view = await getInvoice(companyId, invoiceId);
      if (view.status === 'draft') {
        await sendInvoice(actor, invoiceId, {
          confirmDuplicate: true,
          message: schedule.sendMessage,
        });
        sent = true;
      } else sent = true;
    } catch (e) {
      note =
        `The invoice was made but not sent: ${e instanceof Error ? e.message : 'unknown error'}`.slice(
          0,
          480,
        );
    }
  }
  const rule = recurrenceOf(schedule);
  const next = withinEnd(
    rule,
    { endDate: schedule.endDate, maxOccurrences: schedule.maxOccurrences },
    index + 1,
  )
    ? occurrenceDate(rule, index + 1)
    : null;
  const done = await admin.rpc('kd_recurring_complete', {
    p_run: runId,
    p_invoice: invoiceId,
    p_next: next,
    p_note: note,
  });
  if (done.error) throw new InternalError(done.error);
  return { invoiceId, sent, note };
}

/** Makes the next due occurrence of one schedule, if there is one. */
export async function runSchedule(
  companyId: string,
  scheduleId: string,
  today: string,
): Promise<RunResult | null> {
  const admin = getAdminSupabase();
  const claim = await admin.rpc('kd_recurring_claim', { p_schedule: scheduleId, p_today: today });
  if (claim.error) throw new InternalError(claim.error);
  const c = (
    claim.data as
      { run_id: string; company_id: string; occurrence_index: number; run_date: string }[] | null
  )?.[0];
  if (!c || c.company_id !== companyId) return null;
  try {
    return await runClaimed(
      companyId,
      scheduleId,
      c.run_id,
      toInt(c.occurrence_index),
      String(c.run_date),
    );
  } catch (e) {
    const paused = await admin.rpc('kd_recurring_fail', {
      p_run: c.run_id,
      p_error: e instanceof Error ? e.message.slice(0, 480) : 'Unknown error',
      p_pause_after: PAUSE_AFTER,
    });
    if (!paused.error && paused.data === true) {
      await getService('notification')
        .notify({
          companyId,
          type: 'recurring.paused',
          title: 'A recurring invoice schedule was paused',
          body: 'The schedule failed three times in a row. Open it, fix the problem and resume it.',
          href: `/invoices/recurring/${scheduleId}`,
        })
        .catch(() => undefined);
    }
    return null;
  }
}

/** Owner or staff: make the next invoice now, whatever the date. */
export async function runNow(actor: Actor, id: string): Promise<RunResult> {
  const companyId = need(actor);
  const s = await getSchedule(companyId, id);
  if (s.status !== 'active' || s.nextRunDate === null)
    throw new ValidationError('Only an active schedule can run.');
  const result = await runSchedule(companyId, id, s.nextRunDate);
  if (!result) throw new ConflictError('The schedule is busy or failed. Look at its last error.');
  await getService('audit').record({
    action: 'recurring.run_now',
    resourceType: 'recurring_schedule',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId, invoiceId: result.invoiceId },
  });
  return result;
}

/** Job: makes everything that is due, in each company's own time zone (a few missed runs are caught up). */
export async function runDueSchedules(now: Date = new Date()): Promise<number> {
  const admin = getAdminSupabase();
  const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('recurring_schedules')
    .select('id, company_id, next_run_date')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('next_run_date', 'is', null)
    .lte('next_run_date', horizon)
    .order('next_run_date', { ascending: true })
    .limit(500);
  if (error) throw new InternalError(error);
  const zones = new Map<string, string>();
  let made = 0;
  for (const row of data ?? []) {
    const companyId = String(row.company_id);
    let tz = zones.get(companyId);
    if (tz === undefined) {
      const company = await admin
        .from('companies')
        .select('status')
        .eq('id', companyId)
        .maybeSingle();
      if (company.error || !company.data || company.data.status !== 'active') {
        zones.set(companyId, '');
        continue;
      }
      tz = (await getSection(companyId, 'profile').catch(() => null))?.value.timezone ?? 'UTC';
      zones.set(companyId, tz);
    }
    if (tz === '') continue;
    const today = localDay(now, tz);
    for (let i = 0; i < MAX_CATCH_UP; i += 1) {
      const result = await runSchedule(companyId, String(row.id), today);
      if (!result) break;
      made += 1;
    }
  }
  return made;
}
