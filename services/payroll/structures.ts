// path: services/payroll/structures.ts
// Salary grades, salary components (earnings and deductions), salary structures with their components, and the payroll settings
// (pay frequency, overtime, standard hours, rounding). A structure's component value replaces the component's default.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import type { CompItem, PaySettings, Rounding } from './calc-rules';
import {
  FREQUENCIES,
  componentInput,
  gradeInput,
  settingsInput,
  structureInput,
  structureItemInput,
  type Frequency,
} from './payroll-rules';

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

/* ---------- settings ---------- */

export interface PayrollSettings extends PaySettings {
  payFrequency: Frequency;
  version: number | null;
}

export async function getPayrollSettings(companyId: string): Promise<PayrollSettings> {
  const { data, error } = await getAdminSupabase()
    .from('payroll_settings')
    .select(
      'pay_frequency, overtime_multiplier, overtime_cap_hours, standard_hours_per_month, rounding, version',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    return {
      payFrequency: 'monthly',
      overtimeMultiplier: '1.5000',
      overtimeCapHours: null,
      standardHoursPerMonth: '160.0000',
      rounding: 'cent',
      version: null,
    };
  const freq = FREQUENCIES.find((f) => f === data.pay_frequency) ?? 'monthly';
  return {
    payFrequency: freq,
    overtimeMultiplier: Money.parseRounded(String(data.overtime_multiplier)).toDbString(),
    overtimeCapHours:
      data.overtime_cap_hours === null
        ? null
        : Money.parseRounded(String(data.overtime_cap_hours)).toDbString(),
    standardHoursPerMonth: Money.parseRounded(String(data.standard_hours_per_month)).toDbString(),
    rounding: (['none', 'cent', 'dollar'] as const).find((r) => r === data.rounding) ?? 'cent',
    version: toInt(data.version),
  };
}

export async function savePayrollSettings(actor: Actor, input: unknown): Promise<PayrollSettings> {
  const companyId = need(actor);
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  const row = {
    pay_frequency: d.payFrequency,
    overtime_multiplier: d.overtimeMultiplier,
    overtime_cap_hours: d.overtimeCapHours,
    standard_hours_per_month: d.standardHoursPerMonth,
    rounding: d.rounding satisfies Rounding,
  };
  const admin = getAdminSupabase();
  const current = await getPayrollSettings(companyId);
  if (current.version === null) {
    const { error } = await admin
      .from('payroll_settings')
      .insert({ company_id: companyId, ...row });
    if (error) mapAccountingError(error);
  } else {
    const { data, error } = await admin
      .from('payroll_settings')
      .update(row)
      .eq('company_id', companyId)
      .eq('version', d.version ?? current.version)
      .is('deleted_at', null)
      .select('id');
    if (error) mapAccountingError(error);
    if ((data ?? []).length === 0)
      throw new ConflictError('The settings changed. Reload and try again.');
  }
  await record(companyId, 'payroll.settings_saved', 'payroll_settings', null, row);
  return getPayrollSettings(companyId);
}

/* ---------- grades ---------- */

export interface GradeView {
  id: string;
  name: string;
  minAmount: string;
  maxAmount: string;
}

export async function listGrades(companyId: string): Promise<GradeView[]> {
  const { data, error } = await getAdminSupabase()
    .from('salary_grades')
    .select('id, name, min_amount, max_amount')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    minAmount: Money.parseRounded(String(r.min_amount)).toDbString(),
    maxAmount: Money.parseRounded(String(r.max_amount)).toDbString(),
  }));
}

export async function createGrade(actor: Actor, input: unknown): Promise<GradeView> {
  const companyId = need(actor);
  const parsed = gradeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The grade is not valid.');
  const { data, error } = await getAdminSupabase()
    .from('salary_grades')
    .insert({
      company_id: companyId,
      name: parsed.data.name,
      min_amount: parsed.data.minAmount,
      max_amount: parsed.data.maxAmount,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A grade with this name exists.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  await record(companyId, 'payroll.grade_created', 'salary_grade', id, { name: parsed.data.name });
  return (await listGrades(companyId)).find((g) => g.id === id) as GradeView;
}

export async function removeGrade(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('salary_grades')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'payroll.grade_removed', 'salary_grade', id, {});
}

/* ---------- components ---------- */

export interface ComponentView extends CompItem {
  id: string;
  status: 'active' | 'inactive';
  version: number;
}

const CC = 'id, code, name, kind, calc_type, default_value, taxable, pre_tax, status, version';

interface CRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  calc_type: string;
  default_value: string | number;
  taxable: boolean;
  pre_tax: boolean;
  status: string;
  version: number;
}

const comp = (r: CRow): ComponentView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  kind: r.kind === 'deduction' ? 'deduction' : 'earning',
  calcType:
    r.calc_type === 'percent_of_basic' || r.calc_type === 'percent_of_gross'
      ? r.calc_type
      : 'fixed',
  value: Money.parseRounded(String(r.default_value)).toDbString(),
  taxable: r.taxable,
  preTax: r.pre_tax,
  status: r.status === 'inactive' ? 'inactive' : 'active',
  version: r.version,
});

export async function listComponents(companyId: string): Promise<ComponentView[]> {
  const { data, error } = await getAdminSupabase()
    .from('salary_components')
    .select(CC)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('kind')
    .order('code')
    .limit(500);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as CRow[]).map(comp);
}

export async function createComponent(actor: Actor, input: unknown): Promise<ComponentView> {
  const companyId = need(actor);
  const parsed = componentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The component is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('salary_components')
    .insert({
      company_id: companyId,
      code: d.code,
      name: d.name,
      kind: d.kind,
      calc_type: d.calcType,
      default_value: d.defaultValue,
      taxable: d.taxable,
      pre_tax: d.preTax,
    })
    .select(CC)
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A component with this code exists.');
    mapAccountingError(error);
  }
  const created = comp(data as unknown as CRow);
  await record(companyId, 'payroll.component_created', 'salary_component', created.id, {
    code: d.code,
  });
  return created;
}

export async function setComponentStatus(
  actor: Actor,
  id: string,
  version: number,
  status: 'active' | 'inactive',
): Promise<ComponentView> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('salary_components')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select(CC);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as CRow | undefined;
  if (!row) throw new ConflictError('The component changed. Reload and try again.');
  await record(companyId, 'payroll.component_status', 'salary_component', id, { status });
  return comp(row);
}

/* ---------- structures ---------- */

export interface StructureView {
  id: string;
  name: string;
  payBasis: 'monthly' | 'hourly' | 'commission';
  gradeId: string | null;
  description: string;
  status: 'active' | 'inactive';
  items: { id: string; componentId: string; value: string }[];
  version: number;
}

export async function listStructures(companyId: string): Promise<StructureView[]> {
  const admin = getAdminSupabase();
  const [s, items] = await Promise.all([
    admin
      .from('salary_structures')
      .select('id, name, pay_basis, grade_id, description, status, version')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name')
      .limit(200),
    admin
      .from('salary_structure_items')
      .select('id, structure_id, component_id, value')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .limit(5000),
  ]);
  if (s.error) throw new InternalError(s.error);
  if (items.error) throw new InternalError(items.error);
  return (s.data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    payBasis:
      r.pay_basis === 'hourly' ? 'hourly' : r.pay_basis === 'commission' ? 'commission' : 'monthly',
    gradeId: r.grade_id ? String(r.grade_id) : null,
    description: String(r.description),
    status: r.status === 'inactive' ? 'inactive' : 'active',
    items: (items.data ?? [])
      .filter((i) => String(i.structure_id) === String(r.id))
      .map((i) => ({
        id: String(i.id),
        componentId: String(i.component_id),
        value: Money.parseRounded(String(i.value)).toDbString(),
      })),
    version: toInt(r.version),
  }));
}

export async function createStructure(actor: Actor, input: unknown): Promise<StructureView> {
  const companyId = need(actor);
  const parsed = structureInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The structure is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('salary_structures')
    .insert({
      company_id: companyId,
      name: d.name,
      pay_basis: d.payBasis,
      grade_id: d.gradeId,
      description: d.description,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A structure with this name exists.');
    mapAccountingError(error);
  }
  const id = String((data as { id: string }).id);
  await record(companyId, 'payroll.structure_created', 'salary_structure', id, { name: d.name });
  return (await listStructures(companyId)).find((x) => x.id === id) as StructureView;
}

export async function setStructureItem(
  actor: Actor,
  structureId: string,
  input: unknown,
): Promise<StructureView> {
  const companyId = need(actor);
  const parsed = structureItemInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The component is not valid.');
  const admin = getAdminSupabase();
  const found = await admin
    .from('salary_structure_items')
    .select('id')
    .eq('structure_id', structureId)
    .eq('component_id', parsed.data.componentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  const write = found.data
    ? await admin
        .from('salary_structure_items')
        .update({ value: parsed.data.value })
        .eq('id', found.data.id)
    : await admin.from('salary_structure_items').insert({
        company_id: companyId,
        structure_id: structureId,
        component_id: parsed.data.componentId,
        value: parsed.data.value,
      });
  if (write.error) mapAccountingError(write.error);
  await record(companyId, 'payroll.structure_item_set', 'salary_structure', structureId, {
    componentId: parsed.data.componentId,
    value: parsed.data.value,
  });
  return (await listStructures(companyId)).find((x) => x.id === structureId) as StructureView;
}

export async function removeStructureItem(actor: Actor, itemId: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('salary_structure_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select('structure_id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(
    companyId,
    'payroll.structure_item_removed',
    'salary_structure',
    String(data?.[0]?.structure_id ?? ''),
    { itemId },
  );
}

/** The components of an employee's structure with the structure's values in place of the defaults; inactive components are left out. */
export async function itemsForStructure(
  companyId: string,
  structureId: string | null,
): Promise<CompItem[]> {
  if (!structureId) return [];
  const [components, structures] = await Promise.all([
    listComponents(companyId),
    listStructures(companyId),
  ]);
  const s = structures.find((x) => x.id === structureId);
  if (!s) return [];
  const out: CompItem[] = [];
  for (const i of s.items) {
    const c = components.find((x) => x.id === i.componentId);
    if (c && c.status === 'active')
      out.push({
        code: c.code,
        name: c.name,
        kind: c.kind,
        calcType: c.calcType,
        value: i.value,
        taxable: c.taxable,
        preTax: c.preTax,
      });
  }
  return out;
}
