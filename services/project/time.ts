// path: services/project/time.ts
// Time tracking. People log hours by hand or with a timer on projects they are a member of. An entry goes draft ->
// submitted -> approved (by the owner or the project manager) -> invoiced; a rejected entry goes back to the person.
// From "submitted" on the hours, date, rate and text are fixed (database trigger). The owner can lock a period.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { TimeEntryInput } from '@/lib/project/input';
import { entryAmount, entryRate, timerHours, weekDays, weekStart } from '@/lib/project/time';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listMembers } from '@/services/team/members';
import type { Actor } from '@/types/contracts';
import { getProject, isManager } from './projects';

type Row = Record<string, unknown>;
export type EntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'invoiced';

export interface TimeSettingsView {
  requireApproval: boolean;
  roundMinutes: 0 | 5 | 6 | 10 | 15 | 30 | 60;
  lockThrough: string | null;
  version: number;
}

const SETTINGS_DEFAULTS: TimeSettingsView = {
  requireApproval: true,
  roundMinutes: 0,
  lockThrough: null,
  version: 0,
};

export async function getTimeSettings(companyId: string): Promise<TimeSettingsView> {
  const { data, error } = await getAdminSupabase()
    .from('time_settings')
    .select('require_approval, round_minutes, lock_through, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return SETTINGS_DEFAULTS;
  return {
    requireApproval: data.require_approval === true,
    roundMinutes: toInt(data.round_minutes) as TimeSettingsView['roundMinutes'],
    lockThrough: data.lock_through ? String(data.lock_through) : null,
    version: toInt(data.version, 1),
  };
}

export async function saveTimeSettings(
  actor: Actor,
  input: Omit<TimeSettingsView, 'version'> & { expectedVersion: number },
): Promise<TimeSettingsView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  const columns = {
    require_approval: input.requireApproval,
    round_minutes: input.roundMinutes,
    lock_through: input.lockThrough,
    updated_by: actor.userId,
  };
  if (input.expectedVersion === 0) {
    const r = await admin.from('time_settings').insert({ company_id: companyId, ...columns });
    if (r.error) {
      if (r.error.code === '23505') throw new ConflictError();
      throw new InternalError(r.error);
    }
  } else {
    const r = await admin
      .from('time_settings')
      .update({ ...columns, version: input.expectedVersion + 1 })
      .eq('company_id', companyId)
      .eq('version', input.expectedVersion)
      .is('deleted_at', null)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  }
  await getService('audit').record({
    action: 'time.settings_saved',
    resourceType: 'time_settings',
    resourceId: companyId,
    companyId,
    metadata: {
      lockThrough: input.lockThrough,
      requireApproval: input.requireApproval,
      by: actor.userId,
    },
  });
  return getTimeSettings(companyId);
}

export interface TimeEntryView {
  id: string;
  projectId: string;
  projectName: string;
  userId: string;
  userName: string;
  workDate: string;
  hours: string;
  description: string;
  billable: boolean;
  rate: string;
  amount: string;
  milestoneId: string | null;
  running: boolean;
  startedAt: string | null;
  status: EntryStatus;
  rejectedReason: string;
  invoiceId: string | null;
  version: number;
}

const COLUMNS =
  'id, project_id, user_id, work_date, hours, description, billable, rate, milestone_id, timer_started_at, status, rejected_reason, invoice_id, version';

async function decorate(companyId: string, rows: Row[]): Promise<TimeEntryView[]> {
  const admin = getAdminSupabase();
  const projectIds = [...new Set(rows.map((r) => String(r.project_id)))];
  const projects = new Map<string, string>();
  if (projectIds.length > 0) {
    const p = await admin
      .from('projects')
      .select('id, name')
      .eq('company_id', companyId)
      .in('id', projectIds);
    if (p.error) throw new InternalError(p.error);
    for (const x of p.data ?? []) projects.set(String(x.id), String(x.name));
  }
  const team = await listMembers(companyId).catch(() => []);
  const users = new Map(team.map((m) => [m.userId, m.name || m.email]));
  return rows.map((r) => {
    const hours = Money.parseRounded(String(r.hours)).toDbString().slice(0, -2);
    const rate = Money.parseRounded(String(r.rate)).toDbString();
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: projects.get(String(r.project_id)) ?? '',
      userId: String(r.user_id),
      userName: users.get(String(r.user_id)) ?? '',
      workDate: String(r.work_date),
      hours,
      description: String(r.description ?? ''),
      billable: r.billable === true,
      rate,
      amount: r.billable === true ? entryAmount(hours, rate).toDbString() : '0.0000',
      milestoneId: r.milestone_id ? String(r.milestone_id) : null,
      running: r.timer_started_at !== null,
      startedAt: r.timer_started_at ? String(r.timer_started_at) : null,
      status: String(r.status) as EntryStatus,
      rejectedReason: String(r.rejected_reason ?? ''),
      invoiceId: r.invoice_id ? String(r.invoice_id) : null,
      version: toInt(r.version, 1),
    };
  });
}

export interface TimeFilter {
  projectId?: string;
  userId?: string;
  from?: string;
  to?: string;
  status?: EntryStatus;
  limit: number;
}

/** Entries the person may see: their own, plus everyone's on projects they manage (the owner sees all). */
export async function listEntries(actor: Actor, filter: TimeFilter): Promise<TimeEntryView[]> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const admin = getAdminSupabase();
  let q = admin
    .from('time_entries')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (filter.projectId) q = q.eq('project_id', filter.projectId);
  if (filter.userId) q = q.eq('user_id', filter.userId);
  if (filter.from) q = q.gte('work_date', filter.from);
  if (filter.to) q = q.lte('work_date', filter.to);
  if (filter.status) q = q.eq('status', filter.status);
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
    q =
      ids.length > 0
        ? q.or(`user_id.eq.${actor.userId},project_id.in.(${ids.join(',')})`)
        : q.eq('user_id', actor.userId);
  }
  const { data, error } = await q
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filter.limit);
  if (error) throw new InternalError(error);
  return decorate(companyId, (data ?? []) as unknown as Row[]);
}

async function getEntryRow(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

async function memberOf(
  companyId: string,
  projectId: string,
  userId: string,
): Promise<{ rate: string | null } | null> {
  const { data, error } = await getAdminSupabase()
    .from('project_members')
    .select('rate')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? { rate: data.rate === null ? null : String(data.rate) } : null;
}

/** Checks the project accepts time from this person and gives the rate to freeze on the entry. */
async function rateFor(
  actor: Actor,
  projectId: string,
): Promise<{ rate: string; billable: boolean }> {
  const companyId = actor.companyId as string;
  const project = await getProject(companyId, projectId);
  if (project.status === 'completed' || project.status === 'cancelled')
    throw new ValidationError('This project is closed. Time cannot be added.');
  const member = await memberOf(companyId, projectId, actor.userId);
  if (!member && actor.role !== 'owner') throw new NotFoundError();
  return {
    rate: entryRate(member?.rate ?? null, project.defaultRate),
    billable: project.billingType !== 'non_billable',
  };
}

function lockedMessage(code: string | undefined): never | void {
  if (code === '42501')
    throw new ValidationError('This period is locked. Ask the owner to unlock it.');
}

export async function createEntry(actor: Actor, input: TimeEntryInput): Promise<TimeEntryView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const { rate, billable } = await rateFor(actor, input.projectId);
  if (input.milestoneId) await assertMilestone(companyId, input.projectId, input.milestoneId);
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .insert({
      company_id: companyId,
      project_id: input.projectId,
      user_id: actor.userId,
      work_date: input.workDate,
      hours: input.hours,
      description: input.description,
      billable: input.billable && billable,
      rate,
      milestone_id: input.milestoneId,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    lockedMessage(error.code);
    throw new InternalError(error);
  }
  return (await decorate(companyId, [data as unknown as Row]))[0] as TimeEntryView;
}

async function assertMilestone(
  companyId: string,
  projectId: string,
  milestoneId: string,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('project_milestones')
    .select('id')
    .eq('id', milestoneId)
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new ValidationError('Choose a milestone of this project.');
}

function canChange(actor: Actor, row: Row): boolean {
  return actor.role === 'owner' || String(row.user_id) === actor.userId;
}

export async function updateEntry(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: TimeEntryInput,
): Promise<TimeEntryView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const row = await getEntryRow(companyId, id);
  if (!canChange(actor, row)) throw new NotFoundError();
  if (!['draft', 'rejected'].includes(String(row.status)))
    throw new ValidationError('Only a draft or a rejected entry can be changed.');
  if (row.timer_started_at !== null) throw new ValidationError('Stop the timer first.');
  if (String(row.project_id) !== input.projectId)
    throw new ValidationError(
      'The project of an entry cannot change. Delete it and add a new one.',
    );
  if (input.milestoneId) await assertMilestone(companyId, input.projectId, input.milestoneId);
  const project = await getProject(companyId, input.projectId);
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .update({
      work_date: input.workDate,
      hours: input.hours,
      description: input.description,
      billable: input.billable && project.billingType !== 'non_billable',
      milestone_id: input.milestoneId,
      status: 'draft',
      rejected_reason: '',
      version: expectedVersion + 1,
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) {
    lockedMessage(error.code);
    throw new InternalError(error);
  }
  if (!data || data.length === 0) throw new ConflictError();
  return (await decorate(companyId, [data[0] as unknown as Row]))[0] as TimeEntryView;
}

export async function deleteEntry(actor: Actor, id: string): Promise<void> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const row = await getEntryRow(companyId, id);
  if (!canChange(actor, row)) throw new NotFoundError();
  if (!['draft', 'rejected'].includes(String(row.status)))
    throw new ValidationError('Only a draft or a rejected entry can be deleted.');
  const { error } = await getAdminSupabase()
    .from('time_entries')
    .update({ deleted_at: new Date().toISOString(), timer_started_at: null })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) {
    lockedMessage(error.code);
    throw new InternalError(error);
  }
}

/** The running timer of the person, if any. */
export async function currentTimer(actor: Actor): Promise<TimeEntryView | null> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .select(COLUMNS)
    .eq('company_id', actor.companyId)
    .eq('user_id', actor.userId)
    .not('timer_started_at', 'is', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? ((await decorate(actor.companyId, [data as unknown as Row]))[0] ?? null) : null;
}

export async function startTimer(
  actor: Actor,
  input: { projectId: string; description: string; billable: boolean },
): Promise<TimeEntryView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const { rate, billable } = await rateFor(actor, input.projectId);
  const now = new Date();
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .insert({
      company_id: companyId,
      project_id: input.projectId,
      user_id: actor.userId,
      work_date: now.toISOString().slice(0, 10),
      hours: 0,
      description: input.description,
      billable: input.billable && billable,
      rate,
      timer_started_at: now.toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('A timer is already running. Stop it first.');
    lockedMessage(error.code);
    throw new InternalError(error);
  }
  return (await decorate(companyId, [data as unknown as Row]))[0] as TimeEntryView;
}

export async function stopTimer(actor: Actor): Promise<TimeEntryView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const running = await currentTimer(actor);
  if (!running || running.startedAt === null) throw new ValidationError('No timer is running.');
  const settings = await getTimeSettings(companyId);
  const hours = timerHours(new Date(running.startedAt), new Date(), settings.roundMinutes);
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .update({ hours, timer_started_at: null, version: running.version + 1 })
    .eq('id', running.id)
    .eq('company_id', companyId)
    .eq('version', running.version)
    .not('timer_started_at', 'is', null)
    .select(COLUMNS);
  if (error) {
    lockedMessage(error.code);
    throw new InternalError(error);
  }
  if (!data || data.length === 0) throw new ConflictError();
  return (await decorate(companyId, [data[0] as unknown as Row]))[0] as TimeEntryView;
}

/** Sends entries to approval (or approves them straight away when the company does not need approval). */
export async function submitEntries(actor: Actor, ids: string[]): Promise<number> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const settings = await getTimeSettings(companyId);
  let done = 0;
  for (const id of ids) {
    const row = await getEntryRow(companyId, id);
    if (String(row.user_id) !== actor.userId) throw new NotFoundError();
    if (!['draft', 'rejected'].includes(String(row.status))) continue;
    if (row.timer_started_at !== null)
      throw new ValidationError('Stop the timer before you submit.');
    const patch: Record<string, unknown> = {
      status: settings.requireApproval ? 'submitted' : 'approved',
      submitted_at: new Date().toISOString(),
      rejected_reason: '',
      version: toInt(row.version, 1) + 1,
    };
    if (!settings.requireApproval) {
      patch.approved_by = actor.userId;
      patch.approved_at = new Date().toISOString();
    }
    const r = await getAdminSupabase()
      .from('time_entries')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('version', toInt(row.version, 1))
      .in('status', ['draft', 'rejected'])
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (r.data && r.data.length > 0) done += 1;
  }
  if (done > 0 && settings.requireApproval)
    await getService('notification')
      .notify({
        companyId,
        type: 'time.submitted',
        title: 'Time is waiting for approval',
        body: `${done} time ${done === 1 ? 'entry was' : 'entries were'} submitted for approval.`,
        href: '/timesheets?view=approve',
      })
      .catch(() => undefined);
  return done;
}

/** The owner or the manager of the project approves or rejects submitted entries. */
export async function decideEntries(
  actor: Actor,
  ids: string[],
  decision: { action: 'approve' | 'reject'; reason: string },
): Promise<number> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  let done = 0;
  const managerCache = new Map<string, boolean>();
  for (const id of ids) {
    const row = await getEntryRow(companyId, id);
    const projectId = String(row.project_id);
    let allowed = managerCache.get(projectId);
    if (allowed === undefined) {
      allowed = await isManager(actor, projectId);
      managerCache.set(projectId, allowed);
    }
    if (!allowed) throw new NotFoundError();
    if (String(row.status) !== 'submitted') continue;
    if (String(row.user_id) === actor.userId && actor.role !== 'owner')
      throw new ValidationError('You cannot approve your own time.');
    const approve = decision.action === 'approve';
    const r = await getAdminSupabase()
      .from('time_entries')
      .update(
        approve
          ? {
              status: 'approved',
              approved_by: actor.userId,
              approved_at: new Date().toISOString(),
              version: toInt(row.version, 1) + 1,
            }
          : {
              status: 'rejected',
              rejected_reason: decision.reason,
              version: toInt(row.version, 1) + 1,
            },
      )
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'submitted')
      .eq('version', toInt(row.version, 1))
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (r.data && r.data.length > 0) done += 1;
  }
  await getService('audit').record({
    action: decision.action === 'approve' ? 'time.approved' : 'time.rejected',
    resourceType: 'time_entry',
    resourceId: ids[0] ?? '',
    companyId,
    metadata: { count: done, by: actor.userId, reason: decision.reason },
  });
  return done;
}

export interface TimesheetView {
  weekStart: string;
  days: string[];
  rows: { projectId: string; projectName: string; hoursByDay: string[]; total: string }[];
  dayTotals: string[];
  total: string;
  entries: TimeEntryView[];
}

/** One person's week: hours per project per day. */
export async function timesheet(
  actor: Actor,
  day: string,
  userId?: string,
): Promise<TimesheetView> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const subject = userId && actor.role === 'owner' ? userId : actor.userId;
  const start = weekStart(day);
  const days = weekDays(start);
  const entries = await listEntries(actor, {
    userId: subject,
    from: start,
    to: days[6] as string,
    limit: 1000,
  });
  const mine = entries.filter((e) => e.userId === subject && !e.running);
  const rows = new Map<string, { projectName: string; hours: Money[] }>();
  for (const e of mine) {
    const cell = rows.get(e.projectId) ?? {
      projectName: e.projectName,
      hours: days.map(() => Money.zero()),
    };
    const i = days.indexOf(e.workDate);
    if (i >= 0) cell.hours[i] = (cell.hours[i] as Money).add(e.hours);
    rows.set(e.projectId, cell);
  }
  const fmt = (m: Money): string => m.toDbString().slice(0, -2);
  const dayTotals = days.map((_, i) =>
    fmt(Money.sum([...rows.values()].map((r) => r.hours[i] as Money))),
  );
  return {
    weekStart: start,
    days,
    rows: [...rows.entries()].map(([projectId, r]) => ({
      projectId,
      projectName: r.projectName,
      hoursByDay: r.hours.map(fmt),
      total: fmt(Money.sum(r.hours)),
    })),
    dayTotals,
    total: fmt(Money.sum(dayTotals.map((d) => Money.parse(d)))),
    entries: mine,
  };
}
