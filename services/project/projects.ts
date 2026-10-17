// path: services/project/projects.ts
// Projects: the client they are billed to, billing type, rates, budget, team and milestones. A project with time entries
// cannot be deleted (finish or cancel it instead).
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { BillingType, ProjectInput, ProjectStatus } from '@/lib/project/input';
import { budgetUse, entryAmount, type BudgetUse } from '@/lib/project/time';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listMembers } from '@/services/team/members';
import type { Actor } from '@/types/contracts';

type Row = Record<string, unknown>;
const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();
const decOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : dec(v));
const hours = (v: unknown): string =>
  Money.parseRounded(String(v ?? '0'))
    .toDbString()
    .slice(0, -2);

export interface ProjectView {
  id: string;
  name: string;
  code: string;
  description: string;
  clientId: string | null;
  clientName: string;
  status: ProjectStatus;
  billingType: BillingType;
  defaultRate: string | null;
  fixedFee: string | null;
  retainerHours: string | null;
  budgetHours: string | null;
  budgetAmount: string | null;
  startDate: string | null;
  endDate: string | null;
  version: number;
  createdAt: string;
}

const COLUMNS =
  'id, client_id, name, code, description, status, billing_type, default_rate, fixed_fee, retainer_hours, budget_hours, budget_amount, start_date, end_date, version, created_at';

function toView(r: Row, clientName: string): ProjectView {
  return {
    id: String(r.id),
    name: String(r.name),
    code: String(r.code ?? ''),
    description: String(r.description ?? ''),
    clientId: r.client_id ? String(r.client_id) : null,
    clientName,
    status: String(r.status) as ProjectStatus,
    billingType: String(r.billing_type) as BillingType,
    defaultRate: decOrNull(r.default_rate),
    fixedFee: decOrNull(r.fixed_fee),
    retainerHours: r.retainer_hours === null ? null : hours(r.retainer_hours),
    budgetHours: r.budget_hours === null ? null : hours(r.budget_hours),
    budgetAmount: decOrNull(r.budget_amount),
    startDate: r.start_date ? String(r.start_date) : null,
    endDate: r.end_date ? String(r.end_date) : null,
    version: toInt(r.version, 1),
    createdAt: String(r.created_at),
  };
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function clientNames(companyId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('id, name')
    .eq('company_id', companyId)
    .in('id', ids);
  if (error) throw new InternalError(error);
  for (const c of data ?? []) out.set(String(c.id), String(c.name));
  return out;
}

export async function getProject(companyId: string, id: string): Promise<ProjectView> {
  const { data, error } = await getAdminSupabase()
    .from('projects')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const names = await clientNames(companyId, data.client_id ? [String(data.client_id)] : []);
  return toView(data as unknown as Row, names.get(String(data.client_id)) ?? '');
}

export async function listProjects(
  companyId: string,
  filter: { status?: ProjectStatus; clientId?: string; q?: string; limit: number },
): Promise<ProjectView[]> {
  let q = getAdminSupabase()
    .from('projects')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.clientId) q = q.eq('client_id', filter.clientId);
  const text = (filter.q ?? '').replace(/[^\p{L}\p{N} .-]/gu, ' ').trim();
  if (text !== '') q = q.or(`name.ilike.%${text}%,code.ilike.%${text}%`);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(filter.limit);
  if (error) throw new InternalError(error);
  const names = await clientNames(companyId, [
    ...new Set((data ?? []).filter((r) => r.client_id).map((r) => String(r.client_id))),
  ]);
  return (data ?? []).map((r) => toView(r as unknown as Row, names.get(String(r.client_id)) ?? ''));
}

function columnsOf(input: ProjectInput): Record<string, unknown> {
  return {
    client_id: input.clientId,
    name: input.name,
    code: input.code,
    description: input.description,
    status: input.status,
    billing_type: input.billingType,
    default_rate: input.defaultRate === null ? null : Money.parse(input.defaultRate).toDbString(),
    fixed_fee:
      input.fixedFee === null || input.billingType !== 'fixed'
        ? null
        : Money.parse(input.fixedFee).toDbString(),
    retainer_hours: input.billingType === 'retainer' ? input.retainerHours : null,
    budget_hours: input.budgetHours,
    budget_amount:
      input.budgetAmount === null ? null : Money.parse(input.budgetAmount).toDbString(),
    start_date: input.startDate,
    end_date: input.endDate,
  };
}

export async function createProject(actor: Actor, input: ProjectInput): Promise<ProjectView> {
  const companyId = need(actor);
  if (input.clientId) await getService('clients').getById(input.clientId);
  const { data, error } = await getAdminSupabase()
    .from('projects')
    .insert({ company_id: companyId, created_by: actor.userId, ...columnsOf(input) })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('Another project already uses this code.');
    throw new InternalError(error);
  }
  const id = String(data.id);
  // The person who creates a project is its manager.
  await getAdminSupabase()
    .from('project_members')
    .insert({ company_id: companyId, project_id: id, user_id: actor.userId, role: 'manager' });
  await getService('audit').record({
    action: 'project.created',
    resourceType: 'project',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getProject(companyId, id);
}

export async function updateProject(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: ProjectInput,
): Promise<ProjectView> {
  const companyId = need(actor);
  await assertManager(actor, id);
  if (input.clientId) await getService('clients').getById(input.clientId);
  const { data, error } = await getAdminSupabase()
    .from('projects')
    .update({ ...columnsOf(input), version: expectedVersion + 1 })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('Another project already uses this code.');
    throw new InternalError(error);
  }
  if (!data || data.length === 0) throw new ConflictError();
  await getService('audit').record({
    action: 'project.updated',
    resourceType: 'project',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId, status: input.status },
  });
  return getProject(companyId, id);
}

export async function trashProject(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  await assertManager(actor, id);
  const used = await getAdminSupabase()
    .from('time_entries')
    .select('id')
    .eq('company_id', companyId)
    .eq('project_id', id)
    .is('deleted_at', null)
    .limit(1);
  if (used.error) throw new InternalError(used.error);
  if ((used.data ?? []).length > 0)
    throw new ValidationError(
      'This project has time entries. Mark it completed or cancelled instead.',
    );
  const r = await getAdminSupabase()
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'project.deleted',
    resourceType: 'project',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
}

/** The owner, or a manager of the project. */
export async function isManager(actor: Actor, projectId: string): Promise<boolean> {
  if (actor.role === 'owner') return true;
  if (!actor.companyId) return false;
  const { data, error } = await getAdminSupabase()
    .from('project_members')
    .select('role')
    .eq('company_id', actor.companyId)
    .eq('project_id', projectId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data?.role === 'manager';
}

export async function assertManager(actor: Actor, projectId: string): Promise<void> {
  const companyId = need(actor);
  await getProject(companyId, projectId);
  if (!(await isManager(actor, projectId))) throw new NotFoundError();
}

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'manager' | 'member';
  rate: string | null;
  version: number;
}

export async function listProjectMembers(
  companyId: string,
  projectId: string,
): Promise<MemberRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('project_members')
    .select('id, user_id, role, rate, version')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  const team = await listMembers(companyId).catch(() => []);
  const byUser = new Map(team.map((m) => [m.userId, m]));
  return (data ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    name: byUser.get(String(r.user_id))?.name ?? '',
    email: byUser.get(String(r.user_id))?.email ?? '',
    role: String(r.role) as MemberRow['role'],
    rate: decOrNull(r.rate),
    version: toInt(r.version, 1),
  }));
}

/** People of the company who can be added to a project (active members). */
export async function assignablePeople(
  companyId: string,
): Promise<{ userId: string; name: string; email: string }[]> {
  const team = await listMembers(companyId);
  return team
    .filter((m) => m.status === 'active')
    .map((m) => ({ userId: m.userId, name: m.name, email: m.email }));
}

export async function saveMember(
  actor: Actor,
  projectId: string,
  input: { userId: string; role: 'manager' | 'member'; rate: string | null },
): Promise<MemberRow[]> {
  const companyId = need(actor);
  await assertManager(actor, projectId);
  const people = await assignablePeople(companyId);
  if (!people.some((p) => p.userId === input.userId))
    throw new ValidationError('Choose a person of your team.');
  const admin = getAdminSupabase();
  const existing = await admin
    .from('project_members')
    .select('id, version')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('user_id', input.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const rate = input.rate === null ? null : Money.parse(input.rate).toDbString();
  if (existing.data) {
    const r = await admin
      .from('project_members')
      .update({ role: input.role, rate, version: toInt(existing.data.version, 1) + 1 })
      .eq('id', String(existing.data.id))
      .eq('company_id', companyId);
    if (r.error) throw new InternalError(r.error);
  } else {
    const r = await admin.from('project_members').insert({
      company_id: companyId,
      project_id: projectId,
      user_id: input.userId,
      role: input.role,
      rate,
    });
    if (r.error) throw new InternalError(r.error);
  }
  await getService('audit').record({
    action: 'project.member_saved',
    resourceType: 'project',
    resourceId: projectId,
    companyId,
    metadata: { userId: input.userId, role: input.role, by: actor.userId },
  });
  return listProjectMembers(companyId, projectId);
}

export async function removeMember(
  actor: Actor,
  projectId: string,
  userId: string,
): Promise<MemberRow[]> {
  const companyId = need(actor);
  await assertManager(actor, projectId);
  const managers = (await listProjectMembers(companyId, projectId)).filter(
    (m) => m.role === 'manager',
  );
  if (managers.length === 1 && managers[0]?.userId === userId && actor.role !== 'owner')
    throw new ValidationError('A project needs at least one manager.');
  const r = await getAdminSupabase()
    .from('project_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (r.error) throw new InternalError(r.error);
  await getService('audit').record({
    action: 'project.member_removed',
    resourceType: 'project',
    resourceId: projectId,
    companyId,
    metadata: { userId, by: actor.userId },
  });
  return listProjectMembers(companyId, projectId);
}

export interface MilestoneRow {
  id: string;
  name: string;
  dueDate: string | null;
  amount: string | null;
  status: 'open' | 'done' | 'billed';
  invoiceId: string | null;
  position: number;
  version: number;
}

export async function listMilestones(
  companyId: string,
  projectId: string,
): Promise<MilestoneRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('project_milestones')
    .select('id, name, due_date, amount, status, invoice_id, position, version')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    dueDate: r.due_date ? String(r.due_date) : null,
    amount: decOrNull(r.amount),
    status: String(r.status) as MilestoneRow['status'],
    invoiceId: r.invoice_id ? String(r.invoice_id) : null,
    position: toInt(r.position, 1),
    version: toInt(r.version, 1),
  }));
}

export async function saveMilestone(
  actor: Actor,
  projectId: string,
  milestoneId: string | null,
  input: { name: string; dueDate: string | null; amount: string | null; status: 'open' | 'done' },
): Promise<MilestoneRow[]> {
  const companyId = need(actor);
  await assertManager(actor, projectId);
  const admin = getAdminSupabase();
  const columns = {
    name: input.name,
    due_date: input.dueDate,
    amount: input.amount === null ? null : Money.parse(input.amount).toDbString(),
    status: input.status,
  };
  if (milestoneId === null) {
    const all = await listMilestones(companyId, projectId);
    const r = await admin.from('project_milestones').insert({
      company_id: companyId,
      project_id: projectId,
      position: all.length + 1,
      ...columns,
    });
    if (r.error) throw new InternalError(r.error);
  } else {
    const current = (await listMilestones(companyId, projectId)).find((m) => m.id === milestoneId);
    if (!current) throw new NotFoundError();
    if (current.status === 'billed')
      throw new ValidationError('A billed milestone cannot be changed.');
    const r = await admin
      .from('project_milestones')
      .update({ ...columns, version: current.version + 1 })
      .eq('id', milestoneId)
      .eq('company_id', companyId)
      .eq('project_id', projectId)
      .eq('version', current.version)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  }
  await getService('audit').record({
    action: 'project.milestone_saved',
    resourceType: 'project',
    resourceId: projectId,
    companyId,
    metadata: { milestoneId, by: actor.userId },
  });
  return listMilestones(companyId, projectId);
}

export async function removeMilestone(
  actor: Actor,
  projectId: string,
  milestoneId: string,
): Promise<MilestoneRow[]> {
  const companyId = need(actor);
  await assertManager(actor, projectId);
  const current = (await listMilestones(companyId, projectId)).find((m) => m.id === milestoneId);
  if (!current) throw new NotFoundError();
  if (current.status === 'billed')
    throw new ValidationError('A billed milestone cannot be deleted.');
  const r = await getAdminSupabase()
    .from('project_milestones')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', milestoneId)
    .eq('company_id', companyId)
    .eq('project_id', projectId);
  if (r.error) throw new InternalError(r.error);
  return listMilestones(companyId, projectId);
}

export interface ProjectUsage {
  hours: string;
  billableHours: string;
  amount: string;
  unbilledHours: string;
  unbilledAmount: string;
  budget: BudgetUse;
}

/** Hours and value of the entries of a project (entries that are not rejected). */
export async function projectUsage(companyId: string, project: ProjectView): Promise<ProjectUsage> {
  const { data, error } = await getAdminSupabase()
    .from('time_entries')
    .select('hours, billable, rate, status')
    .eq('company_id', companyId)
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .is('timer_started_at', null)
    .neq('status', 'rejected')
    .limit(20000);
  if (error) throw new InternalError(error);
  let total = Money.zero();
  let billable = Money.zero();
  let amount = Money.zero();
  let unbilledHours = Money.zero();
  let unbilledAmount = Money.zero();
  for (const e of data ?? []) {
    const h = String(e.hours);
    total = total.add(h);
    if (e.billable === true) {
      const value = entryAmount(h, String(e.rate));
      billable = billable.add(h);
      amount = amount.add(value);
      if (e.status === 'approved') {
        unbilledHours = unbilledHours.add(h);
        unbilledAmount = unbilledAmount.add(value);
      }
    }
  }
  const cut = (m: Money): string => m.toDbString().slice(0, -2);
  return {
    hours: cut(total),
    billableHours: cut(billable),
    amount: amount.toDbString(),
    unbilledHours: cut(unbilledHours),
    unbilledAmount: unbilledAmount.toDbString(),
    budget: budgetUse(
      project.budgetHours,
      project.budgetAmount,
      total.toDbString(),
      amount.toDbString(),
    ),
  };
}
