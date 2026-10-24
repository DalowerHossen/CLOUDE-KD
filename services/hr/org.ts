// path: services/hr/org.ts
// The organisation: departments (nested, with a head), positions, where each employee sits (department, position, manager) and
// the two charts, by department and by reporting line. The database refuses loops, a manager or department of another company
// and a department more than six levels deep.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import {
  assignInput,
  buildTree,
  departmentInput,
  departmentUpdate,
  positionInput,
  type OrgNode,
} from './hr-rules';

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function record(
  companyId: string,
  action: string,
  type: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: type,
    resourceId: id,
    companyId,
    metadata,
  });
}

export interface DepartmentView {
  id: string;
  name: string;
  parentId: string | null;
  headEmployeeId: string | null;
  status: 'active' | 'inactive';
  version: number;
}

const DC = 'id, name, parent_id, head_employee_id, status, version';

export async function listDepartments(companyId: string): Promise<DepartmentView[]> {
  const { data, error } = await getAdminSupabase()
    .from('departments')
    .select(DC)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')
    .limit(1000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    parentId: r.parent_id ? String(r.parent_id) : null,
    headEmployeeId: r.head_employee_id ? String(r.head_employee_id) : null,
    status: r.status === 'inactive' ? 'inactive' : 'active',
    version: Number(r.version),
  }));
}

export async function createDepartment(actor: Actor, input: unknown): Promise<DepartmentView> {
  const companyId = need(actor);
  const parsed = departmentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The department is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('departments')
    .insert({
      company_id: companyId,
      name: d.name,
      parent_id: d.parentId,
      head_employee_id: d.headEmployeeId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A department with this name exists here.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  await record(companyId, 'hr.department_created', 'department', id, { name: d.name });
  return (await listDepartments(companyId)).find((x) => x.id === id) as DepartmentView;
}

export async function updateDepartment(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<DepartmentView> {
  const companyId = need(actor);
  const parsed = departmentUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.parentId !== undefined) patch.parent_id = d.parentId;
  if (d.headEmployeeId !== undefined) patch.head_employee_id = d.headEmployeeId;
  if (d.status !== undefined) patch.status = d.status;
  const { data, error } = await getAdminSupabase()
    .from('departments')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    if (error.code === '23505') throw new ConflictError('A department with this name exists here.');
    mapAccountingError(error);
  }
  if ((data ?? []).length === 0)
    throw new ConflictError('The department changed or was removed. Reload and try again.');
  await record(companyId, 'hr.department_changed', 'department', id, {
    fields: Object.keys(patch),
  });
  return (await listDepartments(companyId)).find((x) => x.id === id) as DepartmentView;
}

export async function removeDepartment(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  const used = await admin
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('department_id', id)
    .is('deleted_at', null)
    .limit(1);
  if (used.error) throw new InternalError(used.error);
  if ((used.data ?? []).length > 0)
    throw new ConflictError('Move the employees out of this department first.');
  const kids = await admin
    .from('departments')
    .select('id')
    .eq('company_id', companyId)
    .eq('parent_id', id)
    .is('deleted_at', null)
    .limit(1);
  if (kids.error) throw new InternalError(kids.error);
  if ((kids.data ?? []).length > 0)
    throw new ConflictError('Remove or move the departments inside it first.');
  const { data, error } = await admin
    .from('departments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'hr.department_removed', 'department', id, {});
}

export interface PositionView {
  id: string;
  title: string;
  departmentId: string | null;
  status: 'active' | 'inactive';
}

export async function listPositions(companyId: string): Promise<PositionView[]> {
  const { data, error } = await getAdminSupabase()
    .from('positions')
    .select('id, title, department_id, status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('title')
    .limit(1000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    departmentId: r.department_id ? String(r.department_id) : null,
    status: r.status === 'inactive' ? 'inactive' : 'active',
  }));
}

export async function createPosition(actor: Actor, input: unknown): Promise<PositionView> {
  const companyId = need(actor);
  const parsed = positionInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The position is not valid.');
  const { data, error } = await getAdminSupabase()
    .from('positions')
    .insert({
      company_id: companyId,
      title: parsed.data.title,
      department_id: parsed.data.departmentId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('This position exists.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  await record(companyId, 'hr.position_created', 'position', id, { title: parsed.data.title });
  return (await listPositions(companyId)).find((x) => x.id === id) as PositionView;
}

export async function removePosition(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  const used = await admin
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('position_id', id)
    .is('deleted_at', null)
    .limit(1);
  if (used.error) throw new InternalError(used.error);
  if ((used.data ?? []).length > 0)
    throw new ConflictError('Move the employees out of this position first.');
  const { data, error } = await admin
    .from('positions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'hr.position_removed', 'position', id, {});
}

/** Puts an employee in a department and position and under a manager; the department and title text of the profile follow. */
export async function assignEmployee(
  actor: Actor,
  employeeId: string,
  input: unknown,
): Promise<void> {
  const companyId = need(actor);
  const parsed = assignInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.departmentId !== undefined) {
    patch.department_id = d.departmentId;
    patch.department = d.departmentId
      ? ((await listDepartments(companyId)).find((x) => x.id === d.departmentId)?.name ?? '')
      : '';
  }
  if (d.positionId !== undefined) {
    patch.position_id = d.positionId;
    patch.job_title = d.positionId
      ? ((await listPositions(companyId)).find((x) => x.id === d.positionId)?.title ?? '')
      : '';
  }
  if (d.managerId !== undefined) patch.manager_id = d.managerId;
  const { data, error } = await getAdminSupabase()
    .from('employees')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The employee changed. Reload and try again.');
  await record(companyId, 'hr.employee_placed', 'employee', employeeId, {
    fields: Object.keys(patch),
  });
}

export interface OrgChart {
  byDepartment: OrgNode[];
  byReporting: OrgNode[];
}

/** The two charts: departments (each with its head and the number of people) and the reporting lines of the people who work here. */
export async function orgChart(companyId: string): Promise<OrgChart> {
  const admin = getAdminSupabase();
  const [departments, people] = await Promise.all([
    listDepartments(companyId),
    admin
      .from('employees')
      .select('id, first_name, last_name, job_title, manager_id, department_id, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('status', 'terminated')
      .limit(5000),
  ]);
  if (people.error) throw new InternalError(people.error);
  const rows = people.data ?? [];
  const name = (r: { first_name: unknown; last_name: unknown }): string =>
    `${String(r.first_name)} ${String(r.last_name)}`;
  const count = (id: string): number => rows.filter((r) => r.department_id === id).length;
  const head = (id: string | null): string => {
    const h = rows.find((r) => String(r.id) === id);
    return h ? `, head ${name(h)}` : '';
  };
  return {
    byDepartment: buildTree(
      departments
        .filter((d) => d.status === 'active')
        .map((d) => ({
          id: d.id,
          label: `${d.name} (${count(d.id)}${head(d.headEmployeeId)})`,
          parentId: d.parentId,
        })),
    ),
    byReporting: buildTree(
      rows.map((r) => ({
        id: String(r.id),
        label: `${name(r)}${r.job_title ? `, ${String(r.job_title)}` : ''}`,
        parentId: r.manager_id ? String(r.manager_id) : null,
      })),
    ),
  };
}
