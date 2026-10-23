// path: services/hr/checklists.ts
// Onboarding and offboarding lists. A template is a list of tasks with the days after the start they are due; a checklist is
// made for one employee from a template (or from the default one of that kind) and its tasks are ticked off by a person. The
// database marks a checklist done when every task is ticked.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { DEFAULT_TEMPLATES, checklistInput, dueDay, templateInput, tickInput } from './hr-rules';

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
    resourceType: 'checklist',
    resourceId: id,
    companyId,
    metadata,
  });
}

export interface TemplateView {
  id: string;
  kind: 'onboarding' | 'offboarding';
  name: string;
  items: { title: string; daysAfter: number }[];
}

export async function listTemplates(companyId: string): Promise<TemplateView[]> {
  const admin = getAdminSupabase();
  const [t, items] = await Promise.all([
    admin
      .from('checklist_templates')
      .select('id, kind, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('kind')
      .order('name')
      .limit(200),
    admin
      .from('checklist_template_items')
      .select('template_id, position, title, days_after')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('position')
      .limit(5000),
  ]);
  if (t.error) throw new InternalError(t.error);
  if (items.error) throw new InternalError(items.error);
  return (t.data ?? []).map((r) => ({
    id: String(r.id),
    kind: r.kind === 'offboarding' ? 'offboarding' : 'onboarding',
    name: String(r.name),
    items: (items.data ?? [])
      .filter((i) => String(i.template_id) === String(r.id))
      .map((i) => ({ title: String(i.title), daysAfter: toInt(i.days_after) })),
  }));
}

export async function createTemplate(actor: Actor, input: unknown): Promise<TemplateView> {
  const companyId = need(actor);
  const parsed = templateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The template is not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('checklist_templates')
    .insert({ company_id: companyId, kind: d.kind, name: d.name })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A template with this name exists.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  const ins = await admin.from('checklist_template_items').insert(
    d.items.map((i, n) => ({
      company_id: companyId,
      template_id: id,
      position: n + 1,
      title: i.title,
      days_after: i.daysAfter,
    })),
  );
  if (ins.error) mapAccountingError(ins.error);
  await record(companyId, 'hr.template_created', id, { name: d.name, items: d.items.length });
  return (await listTemplates(companyId)).find((x) => x.id === id) as TemplateView;
}

/** Adds the default onboarding and offboarding templates to a company that has none. */
export async function ensureTemplates(actor: Actor): Promise<number> {
  const companyId = need(actor);
  if ((await listTemplates(companyId)).length > 0) return 0;
  for (const t of DEFAULT_TEMPLATES)
    await createTemplate(actor, {
      kind: t.kind,
      name: t.name,
      items: t.items.map((i) => ({ title: i.title, daysAfter: i.daysAfter })),
    });
  return DEFAULT_TEMPLATES.length;
}

export interface ChecklistView {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: 'onboarding' | 'offboarding';
  name: string;
  status: 'open' | 'done';
  items: { id: string; title: string; dueOn: string | null; done: boolean }[];
}

export async function listChecklists(
  companyId: string,
  filter: { employeeId?: string; open?: boolean } = {},
): Promise<ChecklistView[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('checklists')
    .select('id, employee_id, kind, name, status, employees:employee_id(first_name, last_name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.open) q = q.eq('status', 'open');
  const [lists, items] = await Promise.all([
    q,
    admin
      .from('checklist_items')
      .select('id, checklist_id, position, title, due_on, done_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('position')
      .limit(20_000),
  ]);
  if (lists.error) throw new InternalError(lists.error);
  if (items.error) throw new InternalError(items.error);
  return (lists.data ?? []).map((r) => {
    const e = (
      r as unknown as {
        employees:
          | { first_name: string; last_name: string }
          | { first_name: string; last_name: string }[]
          | null;
      }
    ).employees;
    const x = Array.isArray(e) ? e[0] : e;
    return {
      id: String(r.id),
      employeeId: String(r.employee_id),
      employeeName: x ? `${x.first_name} ${x.last_name}` : '',
      kind: r.kind === 'offboarding' ? 'offboarding' : 'onboarding',
      name: String(r.name),
      status: r.status === 'done' ? 'done' : 'open',
      items: (items.data ?? [])
        .filter((i) => String(i.checklist_id) === String(r.id))
        .map((i) => ({
          id: String(i.id),
          title: String(i.title),
          dueOn: i.due_on ? String(i.due_on) : null,
          done: i.done_at !== null,
        })),
    };
  });
}

/** Makes a checklist for an employee from a template, or from the default of that kind. Due dates count from the join date (onboarding) or today (offboarding). */
export async function createChecklist(actor: Actor, input: unknown): Promise<ChecklistView> {
  const companyId = need(actor);
  const parsed = checklistInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The checklist is not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  if ((await listTemplates(companyId)).length === 0) await ensureTemplates(actor);
  const templates = await listTemplates(companyId);
  const template = d.templateId
    ? templates.find((t) => t.id === d.templateId)
    : templates.find((t) => t.kind === d.kind);
  if (!template || template.kind !== d.kind)
    throw new ValidationError('Choose a template of this kind.');
  const emp = await admin
    .from('employees')
    .select('join_date')
    .eq('company_id', companyId)
    .eq('id', d.employeeId)
    .is('deleted_at', null)
    .maybeSingle();
  if (emp.error) throw new InternalError(emp.error);
  if (!emp.data) throw new NotFoundError();
  const start =
    d.kind === 'onboarding' ? String(emp.data.join_date) : new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('checklists')
    .insert({
      company_id: companyId,
      employee_id: d.employeeId,
      kind: d.kind,
      name: template.name,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) mapAccountingError(error);
  const id = String((data as { id: string }).id);
  const ins = await admin.from('checklist_items').insert(
    template.items.map((i, n) => ({
      company_id: companyId,
      checklist_id: id,
      position: n + 1,
      title: i.title,
      due_on: dueDay(start, i.daysAfter),
    })),
  );
  if (ins.error) mapAccountingError(ins.error);
  await record(companyId, 'hr.checklist_created', id, { employeeId: d.employeeId, kind: d.kind });
  return (await listChecklists(companyId)).find((x) => x.id === id) as ChecklistView;
}

export async function tickItem(actor: Actor, itemId: string, input: unknown): Promise<void> {
  const companyId = need(actor);
  const parsed = tickInput.safeParse(input);
  if (!parsed.success) throw new ValidationError('Say whether the task is done.');
  const { data, error } = await getAdminSupabase()
    .from('checklist_items')
    .update(
      parsed.data.done
        ? { done_at: new Date().toISOString(), done_by: actor.userId }
        : { done_at: null, done_by: null },
    )
    .eq('company_id', companyId)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select('checklist_id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'hr.checklist_item_ticked', String(data?.[0]?.checklist_id ?? ''), {
    itemId,
    done: parsed.data.done,
  });
}
