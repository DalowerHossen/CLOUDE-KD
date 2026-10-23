// path: services/hr/leave.ts
// Leave. Types say the days per year; each employee has a balance per type and year (made for the year from the type, pro rata for
// someone who joined during the year, with carry over). A request is for working days inside one year and cannot ask for more than
// is left, counting the requests still waiting; the database takes the days from the balance when the request is approved (once)
// and gives them back when an approved request is cancelled. The employee asks through the portal or the owner enters it.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import type { PortalAccess } from '@/services/portal/access';
import { recordPortalEvent } from '@/services/portal/events';
import {
  balanceInput,
  daysLeft,
  leaveDecideInput,
  leaveDays,
  leaveRequestInput,
  leaveTypeInput,
  portalLeaveInput,
  yearlyEntitlement,
} from './hr-rules';

const log = createLogger({ component: 'leave' });
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
    resourceType: 'leave',
    resourceId: id,
    companyId,
    metadata,
  });
}

const m = (v: string | number): string => Money.parseRounded(String(v)).toDbString();

/* ---------- types ---------- */

export interface LeaveTypeView {
  id: string;
  name: string;
  annualDays: string;
  paid: boolean;
  carryOverDays: string;
  status: 'active' | 'inactive';
  version: number;
}

export async function listLeaveTypes(companyId: string): Promise<LeaveTypeView[]> {
  const { data, error } = await getAdminSupabase()
    .from('leave_types')
    .select('id, name, annual_days, paid, carry_over_days, status, version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    annualDays: m(r.annual_days as string | number),
    paid: r.paid === true,
    carryOverDays: m(r.carry_over_days as string | number),
    status: r.status === 'inactive' ? 'inactive' : 'active',
    version: toInt(r.version),
  }));
}

export async function createLeaveType(actor: Actor, input: unknown): Promise<LeaveTypeView> {
  const companyId = need(actor);
  const parsed = leaveTypeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The leave type is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('leave_types')
    .insert({
      company_id: companyId,
      name: d.name,
      annual_days: d.annualDays,
      paid: d.paid,
      carry_over_days: d.carryOverDays,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A leave type with this name exists.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  await record(companyId, 'hr.leave_type_created', id, { name: d.name });
  return (await listLeaveTypes(companyId)).find((x) => x.id === id) as LeaveTypeView;
}

export async function setLeaveTypeStatus(
  actor: Actor,
  id: string,
  version: number,
  status: 'active' | 'inactive',
): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('leave_types')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The leave type changed. Reload and try again.');
  await record(companyId, 'hr.leave_type_status', id, { status });
}

/* ---------- balances ---------- */

export interface BalanceView {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitled: string;
  used: string;
  waiting: string;
  left: string;
}

async function waitingDays(
  companyId: string,
  employeeId: string | null,
): Promise<Map<string, Money>> {
  let q = getAdminSupabase()
    .from('leave_requests')
    .select('employee_id, leave_type_id, days, start_date')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .limit(20_000);
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const out = new Map<string, Money>();
  for (const r of data ?? []) {
    const key = `${String(r.employee_id)}|${String(r.leave_type_id)}|${String(r.start_date).slice(0, 4)}`;
    out.set(key, (out.get(key) ?? Money.zero()).add(m(r.days as string | number)));
  }
  return out;
}

export async function listBalances(
  companyId: string,
  filter: { employeeId?: string; year?: number } = {},
): Promise<BalanceView[]> {
  let q = getAdminSupabase()
    .from('leave_balances')
    .select('id, employee_id, leave_type_id, year, entitled, used')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('year', { ascending: false })
    .limit(20_000);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.year) q = q.eq('year', filter.year);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const waiting = await waitingDays(companyId, filter.employeeId ?? null);
  return (data ?? []).map((r) => {
    const w =
      waiting.get(`${String(r.employee_id)}|${String(r.leave_type_id)}|${String(r.year)}`) ??
      Money.zero();
    return {
      id: String(r.id),
      employeeId: String(r.employee_id),
      leaveTypeId: String(r.leave_type_id),
      year: toInt(r.year),
      entitled: m(r.entitled as string | number),
      used: m(r.used as string | number),
      waiting: w.toDbString(),
      left: daysLeft(
        m(r.entitled as string | number),
        m(r.used as string | number),
        w.toDbString(),
      ),
    };
  });
}

/** Sets the days of one employee for a type and year (made if missing; never below what was used). */
export async function setBalance(actor: Actor, input: unknown): Promise<BalanceView> {
  const companyId = need(actor);
  const parsed = balanceInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The balance is not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  const found = await admin
    .from('leave_balances')
    .select('id, version')
    .eq('employee_id', d.employeeId)
    .eq('leave_type_id', d.leaveTypeId)
    .eq('year', d.year)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  const write = found.data
    ? await admin
        .from('leave_balances')
        .update({ entitled: d.entitled })
        .eq('id', found.data.id)
        .eq('version', found.data.version)
    : await admin.from('leave_balances').insert({
        company_id: companyId,
        employee_id: d.employeeId,
        leave_type_id: d.leaveTypeId,
        year: d.year,
        entitled: d.entitled,
      });
  if (write.error) mapAccountingError(write.error);
  await record(companyId, 'hr.leave_balance_set', d.employeeId, {
    year: d.year,
    entitled: d.entitled,
  });
  return (await listBalances(companyId, { employeeId: d.employeeId, year: d.year })).find(
    (b) => b.leaveTypeId === d.leaveTypeId,
  ) as BalanceView;
}

/** Makes the balances of a year for every current employee and active type, from the type's days (pro rata, with carry over). Safe to run again. */
export async function generateBalances(actor: Actor, year: number): Promise<{ made: number }> {
  const companyId = need(actor);
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    throw new ValidationError('Choose a year.');
  const admin = getAdminSupabase();
  const [types, people, current, previous] = await Promise.all([
    listLeaveTypes(companyId),
    admin
      .from('employees')
      .select('id, join_date, end_date, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .limit(5000),
    listBalances(companyId, { year }),
    listBalances(companyId, { year: year - 1 }),
  ]);
  if (people.error) throw new InternalError(people.error);
  let made = 0;
  for (const e of people.data ?? []) {
    if (e.status === 'terminated' && e.end_date && String(e.end_date).slice(0, 4) < String(year))
      continue;
    for (const t of types.filter((x) => x.status === 'active')) {
      if (current.some((b) => b.employeeId === String(e.id) && b.leaveTypeId === t.id)) continue;
      const before = previous.find((b) => b.employeeId === String(e.id) && b.leaveTypeId === t.id);
      const entitled = yearlyEntitlement(
        t.annualDays,
        String(e.join_date),
        year,
        t.carryOverDays,
        before?.left ?? '0',
      );
      if (Money.parse(entitled).isZero()) continue;
      const { error } = await admin
        .from('leave_balances')
        .insert({ company_id: companyId, employee_id: e.id, leave_type_id: t.id, year, entitled });
      if (error) {
        if (error.code === '23505') continue;
        mapAccountingError(error);
      }
      made += 1;
    }
  }
  await record(companyId, 'hr.leave_balances_generated', null, { year, made });
  return { made };
}

/* ---------- requests ---------- */

export interface RequestView {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decisionNote: string;
}

const RC =
  'id, employee_id, leave_type_id, start_date, end_date, days, reason, status, decision_note, employees:employee_id(first_name, last_name)';

const request = (r: Record<string, unknown>): RequestView => {
  const e = r.employees as
    { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  const x = Array.isArray(e) ? e[0] : e;
  const s = String(r.status);
  return {
    id: String(r.id),
    employeeId: String(r.employee_id),
    employeeName: x ? `${x.first_name} ${x.last_name}` : '',
    leaveTypeId: String(r.leave_type_id),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    days: m(r.days as string | number),
    reason: String(r.reason),
    status: s === 'approved' || s === 'rejected' || s === 'cancelled' ? s : 'pending',
    decisionNote: String(r.decision_note),
  };
};

export async function listRequests(
  companyId: string,
  filter: { employeeId?: string; status?: string } = {},
): Promise<RequestView[]> {
  let q = getAdminSupabase()
    .from('leave_requests')
    .select(RC)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(1000);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => request(r as unknown as Record<string, unknown>));
}

async function insertRequest(
  companyId: string,
  employeeId: string,
  createdBy: string | null,
  tokenId: string | null,
  d: { leaveTypeId: string; startDate: string; endDate: string; halfDay: boolean; reason: string },
): Promise<RequestView> {
  const days = leaveDays(d.startDate, d.endDate, d.halfDay);
  if (Money.parse(days).isZero()) throw new ValidationError('These dates have no working days.');
  const { data, error } = await getAdminSupabase()
    .from('leave_requests')
    .insert({
      company_id: companyId,
      employee_id: employeeId,
      leave_type_id: d.leaveTypeId,
      start_date: d.startDate,
      end_date: d.endDate,
      days,
      reason: d.reason,
      created_by: createdBy,
      token_id: tokenId,
    })
    .select(RC)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('These dates overlap another leave request.');
    if (error.code === '23514')
      throw new ValidationError(
        error.message?.includes('balance')
          ? 'There is no leave balance for this year. Ask your employer.'
          : 'The request is more than the leave left.',
      );
    mapAccountingError(error);
  }
  const created = request(data as unknown as Record<string, unknown>);
  await record(companyId, 'hr.leave_requested', created.id, { days, employeeId });
  await getService('notification')
    .notify({
      companyId,
      type: 'hr.leave_request',
      title: 'A leave request waits',
      body: `${created.employeeName} asked for ${days} day(s) from ${d.startDate} to ${d.endDate}.`,
      href: '/hr/leave',
    })
    .catch((e: unknown) => log.error('leave notice not sent', { error: String(e) }));
  return created;
}

export async function createRequest(actor: Actor, input: unknown): Promise<RequestView> {
  const companyId = need(actor);
  const parsed = leaveRequestInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The request is not valid.');
  const { employeeId, ...rest } = parsed.data;
  return insertRequest(companyId, employeeId, actor.userId, null, rest);
}

export async function decideRequest(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<RequestView> {
  const companyId = need(actor);
  const parsed = leaveDecideInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The decision is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('leave_requests')
    .update({
      status: d.decision === 'approve' ? 'approved' : 'rejected',
      decided_by: actor.userId,
      decided_at: new Date().toISOString(),
      decision_note: d.note,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'pending')
    .select(RC);
  if (error) {
    if (error.code === '23514')
      throw new ValidationError('The request is more than the leave left.');
    mapAccountingError(error);
  }
  const row = (data ?? [])[0];
  if (!row) throw new ConflictError('This request was already decided or does not exist.');
  await record(
    companyId,
    d.decision === 'approve' ? 'hr.leave_approved' : 'hr.leave_rejected',
    id,
    { note: d.note },
  );
  return request(row as unknown as Record<string, unknown>);
}

/** Cancels a request: a waiting one, or an approved one (the days go back to the balance). */
export async function cancelRequest(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('company_id', companyId)
    .eq('id', id)
    .in('status', ['pending', 'approved'])
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'hr.leave_cancelled', id, {});
}

/* ---------- the portal ---------- */

type OkAccess = Extract<PortalAccess, { state: 'ok' }>;

export interface PortalLeave {
  types: { id: string; name: string }[];
  balances: { type: string; year: number; entitled: string; used: string; left: string }[];
  requests: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    days: string;
    status: string;
    note: string;
  }[];
}

export async function portalLeave(access: OkAccess): Promise<PortalLeave> {
  const [types, balances, requests] = await Promise.all([
    listLeaveTypes(access.companyId),
    listBalances(access.companyId, { employeeId: access.docId }),
    listRequests(access.companyId, { employeeId: access.docId }),
  ]);
  const name = (id: string): string => types.find((t) => t.id === id)?.name ?? '';
  const year = new Date().getUTCFullYear();
  return {
    types: types.filter((t) => t.status === 'active').map((t) => ({ id: t.id, name: t.name })),
    balances: balances
      .filter((b) => b.year >= year - 1)
      .map((b) => ({
        type: name(b.leaveTypeId),
        year: b.year,
        entitled: b.entitled,
        used: b.used,
        left: b.left,
      })),
    requests: requests.slice(0, 30).map((r) => ({
      id: r.id,
      type: name(r.leaveTypeId),
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
      status: r.status,
      note: r.decisionNote,
    })),
  };
}

/** A request from the portal: the link says who the employee is; an employee never asks for another person. */
export async function submitPortalLeave(access: OkAccess, input: unknown): Promise<RequestView> {
  const parsed = portalLeaveInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The request is not valid.');
  const created = await insertRequest(
    access.companyId,
    access.docId,
    null,
    access.tokenId,
    parsed.data,
  );
  await recordPortalEvent(access, 'view');
  return created;
}

/** An employee cancels their own waiting request from the portal. */
export async function cancelPortalLeave(access: OkAccess, id: string): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('company_id', access.companyId)
    .eq('employee_id', access.docId)
    .eq('id', id)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(access.companyId, 'hr.leave_cancelled_by_employee', id, {});
}
