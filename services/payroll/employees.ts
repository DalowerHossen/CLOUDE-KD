// path: services/payroll/employees.ts
// Employees. Pay, bank account and tax identity are stored encrypted (the platform's encryption service, scoped to the company);
// plain columns hold the rest. Reading the pay, bank or tax fields needs their own permission and every view of an employee is
// written to the audit log with the groups of fields that were shown. The bank account and tax id are shown masked; the full
// values are read only by the pay run code through `payDetails`.
import 'server-only';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { maskIdentifier } from '@/lib/encryption/redact';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, EncryptedPayload } from '@/types/contracts';
import { attachmentInput } from '@/services/accounting/attachments';
import { mapAccountingError } from '@/services/accounting/db-errors';
import {
  bankInfo,
  employeeInput,
  employeesCsv,
  employeeUpdate,
  parseEmployeesCsv,
  payInfo,
  taxInfo,
  type BankInfo,
  type EmployeeInput,
  type PayInfo,
  type TaxInfo,
} from './payroll-rules';

export interface EmployeeView {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string | null;
  department: string;
  jobTitle: string;
  joinDate: string;
  endDate: string | null;
  contractType: string;
  payBasis: 'monthly' | 'hourly' | 'commission';
  gradeId: string | null;
  structureId: string | null;
  status: 'active' | 'on_leave' | 'terminated';
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  customFields: Record<string, string>;
  hasPay: boolean;
  hasBank: boolean;
  hasTax: boolean;
  version: number;
}

export interface SensitiveView {
  baseAmount: string;
  commissionRatePercent: string;
  bankHolder: string;
  bankName: string;
  /** Masked: only the last four characters. */
  accountNumber: string;
  taxIdMasked: string;
  filingStatus: string;
  allowances: number;
}

const COLUMNS =
  'id, employee_number, first_name, last_name, email, phone, address, date_of_birth, department, job_title, join_date, end_date, contract_type, pay_basis, grade_id, structure_id, status, emergency_name, emergency_phone, emergency_relation, custom_fields, pay_enc, bank_enc, tax_enc, version';

interface Row {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  date_of_birth: string | null;
  department: string;
  job_title: string;
  join_date: string;
  end_date: string | null;
  contract_type: string;
  pay_basis: string;
  grade_id: string | null;
  structure_id: string | null;
  status: string;
  emergency_name: string;
  emergency_phone: string;
  emergency_relation: string;
  custom_fields: Record<string, string> | null;
  pay_enc: EncryptedPayload | null;
  bank_enc: EncryptedPayload | null;
  tax_enc: EncryptedPayload | null;
  version: number;
}

const view = (r: Row): EmployeeView => ({
  id: r.id,
  number: r.employee_number,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  dateOfBirth: r.date_of_birth,
  department: r.department,
  jobTitle: r.job_title,
  joinDate: String(r.join_date),
  endDate: r.end_date,
  contractType: r.contract_type,
  payBasis:
    r.pay_basis === 'hourly' ? 'hourly' : r.pay_basis === 'commission' ? 'commission' : 'monthly',
  gradeId: r.grade_id,
  structureId: r.structure_id,
  status:
    r.status === 'on_leave' ? 'on_leave' : r.status === 'terminated' ? 'terminated' : 'active',
  emergencyName: r.emergency_name,
  emergencyPhone: r.emergency_phone,
  emergencyRelation: r.emergency_relation,
  customFields: r.custom_fields ?? {},
  hasPay: r.pay_enc !== null,
  hasBank: r.bank_enc !== null,
  hasTax: r.tax_enc !== null,
  version: r.version,
});

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function seal(companyId: string, value: unknown): Promise<EncryptedPayload> {
  return getService('encryption').encrypt('pii', JSON.stringify(value), companyId);
}

async function open<T>(
  companyId: string,
  payload: EncryptedPayload | null,
  parse: (v: unknown) => T | null,
): Promise<T | null> {
  if (!payload) return null;
  const bytes = await getService('encryption').decrypt('pii', payload, companyId);
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}

async function can(actor: Actor, action: string): Promise<boolean> {
  return getService('permissions').can(actor, action, { type: 'employee' });
}

async function record(
  companyId: string,
  action: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'employee',
    resourceId: id,
    companyId,
    metadata,
  });
}

export interface EmployeeFilter {
  status?: 'active' | 'on_leave' | 'terminated';
  department?: string;
  search?: string;
}

export async function listEmployees(
  companyId: string,
  filter: EmployeeFilter = {},
): Promise<EmployeeView[]> {
  let q = getAdminSupabase()
    .from('employees')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('employee_number', { ascending: true })
    .limit(5000);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.department) q = q.eq('department', filter.department);
  if (filter.search) {
    const s = filter.search.replace(/[%,()*\\]/g, ' ').trim();
    if (s)
      q = q.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,employee_number.ilike.%${s}%`,
      );
  }
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('employees')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

/** One employee. Every view is audited; the pay, bank and tax groups are included only with the permission, and say so in the audit entry. */
export async function getEmployee(
  actor: Actor,
  id: string,
): Promise<{ employee: EmployeeView; sensitive: SensitiveView | null }> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  const employee = view(row);
  let sensitive: SensitiveView | null = null;
  if (await can(actor, 'payroll.pay.read')) {
    const [pay, bank, tax] = await Promise.all([
      open(companyId, row.pay_enc, (v) => {
        const p = payInfo.safeParse(v);
        return p.success ? p.data : null;
      }),
      open(companyId, row.bank_enc, (v) => {
        const p = bankInfo.safeParse(v);
        return p.success ? p.data : null;
      }),
      open(companyId, row.tax_enc, (v) => {
        const p = taxInfo.safeParse(v);
        return p.success ? p.data : null;
      }),
    ]);
    sensitive = {
      baseAmount: pay?.baseAmount ?? '',
      commissionRatePercent: pay?.commissionRatePercent ?? '0',
      bankHolder: bank?.holder ?? '',
      bankName: bank?.bankName ?? '',
      accountNumber: bank ? maskIdentifier(bank.accountNumber) : '',
      taxIdMasked: tax ? maskIdentifier(tax.taxId) : '',
      filingStatus: tax?.filingStatus ?? '',
      allowances: tax?.allowances ?? 0,
    };
  }
  await record(companyId, 'payroll.employee_viewed', id, {
    groups: sensitive ? ['profile', 'pay', 'bank', 'tax'] : ['profile'],
  });
  return { employee, sensitive };
}

/** The encrypted columns for the groups given (undefined keeps a group as it is, null clears it). Needs the pay permission. */
async function sealedColumns(
  actor: Actor,
  companyId: string,
  d: { pay?: PayInfo | null; bank?: BankInfo | null; tax?: TaxInfo | null },
): Promise<Record<string, unknown>> {
  const touches = d.pay !== undefined || d.bank !== undefined || d.tax !== undefined;
  if (touches && !(await can(actor, 'payroll.pay.manage')))
    throw new ForbiddenError('You may not change pay, bank or tax details.');
  const out: Record<string, unknown> = {};
  if (d.pay !== undefined) out.pay_enc = d.pay === null ? null : await seal(companyId, d.pay);
  if (d.bank !== undefined) out.bank_enc = d.bank === null ? null : await seal(companyId, d.bank);
  if (d.tax !== undefined) out.tax_enc = d.tax === null ? null : await seal(companyId, d.tax);
  return out;
}

async function insertEmployee(
  actor: Actor,
  companyId: string,
  d: EmployeeInput,
): Promise<EmployeeView> {
  const sealed = await sealedColumns(actor, companyId, {
    ...(d.pay ? { pay: d.pay } : {}),
    ...(d.bank ? { bank: d.bank } : {}),
    ...(d.tax ? { tax: d.tax } : {}),
  });
  const { data, error } = await getAdminSupabase()
    .from('employees')
    .insert({
      company_id: companyId,
      first_name: d.firstName,
      last_name: d.lastName,
      email: d.email,
      phone: d.phone,
      address: d.address,
      date_of_birth: d.dateOfBirth,
      department: d.department,
      job_title: d.jobTitle,
      join_date: d.joinDate,
      contract_type: d.contractType,
      pay_basis: d.payBasis,
      grade_id: d.gradeId,
      structure_id: d.structureId,
      emergency_name: d.emergencyName,
      emergency_phone: d.emergencyPhone,
      emergency_relation: d.emergencyRelation,
      custom_fields: d.customFields,
      created_by: actor.userId,
      ...sealed,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('An employee with this email already exists.');
    mapAccountingError(error);
  }
  const created = view(data as unknown as Row);
  await record(companyId, 'payroll.employee_created', created.id, { number: created.number });
  return created;
}

export async function createEmployee(actor: Actor, input: unknown): Promise<EmployeeView> {
  const companyId = need(actor);
  const parsed = employeeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The employee is not valid.');
  return insertEmployee(actor, companyId, parsed.data);
}

export async function updateEmployee(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<EmployeeView> {
  const companyId = need(actor);
  const parsed = employeeUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  const map: [keyof typeof d, string][] = [
    ['firstName', 'first_name'],
    ['lastName', 'last_name'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['address', 'address'],
    ['dateOfBirth', 'date_of_birth'],
    ['department', 'department'],
    ['jobTitle', 'job_title'],
    ['joinDate', 'join_date'],
    ['contractType', 'contract_type'],
    ['payBasis', 'pay_basis'],
    ['gradeId', 'grade_id'],
    ['structureId', 'structure_id'],
    ['emergencyName', 'emergency_name'],
    ['emergencyPhone', 'emergency_phone'],
    ['emergencyRelation', 'emergency_relation'],
    ['customFields', 'custom_fields'],
    ['status', 'status'],
    ['endDate', 'end_date'],
  ];
  for (const [k, col] of map) if (d[k] !== undefined) patch[col] = d[k];
  Object.assign(
    patch,
    await sealedColumns(actor, companyId, { pay: d.pay, bank: d.bank, tax: d.tax }),
  );
  const { data, error } = await getAdminSupabase()
    .from('employees')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('An employee with this email already exists.');
    mapAccountingError(error);
  }
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new ConflictError('The employee changed or was removed. Reload and try again.');
  await record(companyId, 'payroll.employee_changed', id, {
    fields: Object.keys(patch).map((k) =>
      k.endsWith('_enc') ? `${k.slice(0, -4)} (encrypted)` : k,
    ),
  });
  return view(row);
}

/** Archive: the employee is hidden from lists and from new pay runs; the pay history stays. */
export async function archiveEmployee(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'terminated')
    throw new ConflictError('Only a terminated employee can be archived.');
  const { error } = await getAdminSupabase()
    .from('employees')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) mapAccountingError(error);
  await record(companyId, 'payroll.employee_archived', id, {});
}

export interface EmployeeImportResult {
  created: number;
  errors: { line: number; message: string }[];
}

export async function importEmployees(actor: Actor, csv: string): Promise<EmployeeImportResult> {
  const companyId = need(actor);
  const parsed = parseEmployeesCsv(csv);
  const errors = [...parsed.errors];
  let created = 0;
  for (const r of parsed.rows) {
    try {
      await insertEmployee(actor, companyId, r.input);
      created += 1;
    } catch (e) {
      errors.push({
        line: r.line,
        message: e instanceof Error ? e.message : 'The employee could not be added.',
      });
    }
  }
  return { created, errors };
}

/** CSV of the directory without pay, bank or tax details. The export is audited. */
export async function exportEmployeesCsv(actor: Actor): Promise<string> {
  const companyId = need(actor);
  const list = await listEmployees(companyId);
  await record(companyId, 'payroll.employees_exported', null, { count: list.length });
  return employeesCsv(
    list.map((e) => ({
      number: e.number,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone,
      department: e.department,
      jobTitle: e.jobTitle,
      joinDate: e.joinDate,
      contractType: e.contractType,
      payBasis: e.payBasis,
      status: e.status,
    })),
  );
}

/** The decrypted pay details, for the pay run code only. Not exposed by any route. */
export async function payDetails(
  companyId: string,
  id: string,
): Promise<{ employee: EmployeeView; pay: PayInfo | null; bank: BankInfo | null }> {
  const row = await rowOf(companyId, id);
  const [pay, bank] = await Promise.all([
    open(companyId, row.pay_enc, (v) => {
      const p = payInfo.safeParse(v);
      return p.success ? p.data : null;
    }),
    open(companyId, row.bank_enc, (v) => {
      const p = bankInfo.safeParse(v);
      return p.success ? p.data : null;
    }),
  ]);
  return { employee: view(row), pay, bank };
}

export interface EmployeeDocumentView {
  id: string;
  name: string;
  kind: string;
}

export async function listDocuments(
  companyId: string,
  employeeId: string,
): Promise<EmployeeDocumentView[]> {
  const { data, error } = await getAdminSupabase()
    .from('employee_documents')
    .select('id, name, kind')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
  }));
}

export async function addDocument(
  actor: Actor,
  employeeId: string,
  kind: string,
  input: unknown,
): Promise<EmployeeDocumentView> {
  const companyId = need(actor);
  const parsed = attachmentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The file is not valid.');
  if (!['contract', 'identity', 'certificate', 'other'].includes(kind))
    throw new ValidationError('Choose the kind of document.');
  await rowOf(companyId, employeeId);
  const bytes = new Uint8Array(Buffer.from(parsed.data.dataBase64, 'base64'));
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    !ATTACHMENT_TYPES.includes(parsed.data.mimeType)
  )
    throw new ValidationError('Use a PDF, PNG, JPEG or CSV file of at most 8 MB.');
  const record1 = await getService('storage').put({
    companyId,
    category: kind === 'contract' ? 'contract' : 'other',
    name: parsed.data.name,
    bytes,
    mimeType: parsed.data.mimeType,
  });
  const { data, error } = await getAdminSupabase()
    .from('employee_documents')
    .insert({
      company_id: companyId,
      employee_id: employeeId,
      file_id: record1.id,
      name: parsed.data.name,
      kind,
      created_by: actor.userId,
    })
    .select('id, name, kind')
    .single();
  if (error) mapAccountingError(error);
  await record(companyId, 'payroll.document_added', employeeId, { name: parsed.data.name, kind });
  return { id: String(data.id), name: String(data.name), kind: String(data.kind) };
}

export async function documentLink(actor: Actor, id: string): Promise<string> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('employee_documents')
    .select('file_id, employee_id')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  await record(companyId, 'payroll.document_opened', String(data.employee_id), { documentId: id });
  return getService('storage').signedUrl(String(data.file_id), 300);
}
