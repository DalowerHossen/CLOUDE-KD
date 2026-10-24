// path: services/payroll/portal.ts
// The employee portal. The owner issues a link for one employee through the tokens contract (document type `payslip`, the
// document id is the employee; it expires in days and asks for an e-mailed code by default) and may e-mail it to the employee's
// address on file. The employee sees only their own payslips and sends a tax declaration, which the owner approves or rejects.
// A payslip is opened through a short-lived link of the storage contract and every opening is recorded.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { siteUrl } from '@/lib/cms/site-url';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import type { PortalAccess } from '@/services/portal/access';
import { recordPortalEvent } from '@/services/portal/events';
import { getTaxInfo, payDetails, updateEmployee } from './employees';
import {
  declarationInput,
  decideDeclarationInput,
  linkInput,
  mergeDeclaration,
  portalUrl,
  visiblePayslips,
  type PortalItem,
} from './portal-rules';
import { taxInfo } from './payroll-rules';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';

const log = createLogger({ component: 'employee-portal' });
const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function audit(
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

/* ---------- the owner issues and revokes links ---------- */

export interface LinkView {
  id: string;
  employeeId: string;
  expiresAt: string;
  otpRequired: boolean;
  sentAt: string | null;
  revokedAt: string | null;
  state: 'active' | 'expired' | 'revoked';
}

export async function listLinks(companyId: string, employeeId: string): Promise<LinkView[]> {
  const { data, error } = await getAdminSupabase()
    .from('employee_portal_links')
    .select('id, employee_id, expires_at, otp_required, sent_at, revoked_at')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    employeeId: String(r.employee_id),
    expiresAt: String(r.expires_at),
    otpRequired: r.otp_required === true,
    sentAt: r.sent_at ? String(r.sent_at) : null,
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
    state: r.revoked_at
      ? 'revoked'
      : Date.parse(String(r.expires_at)) <= Date.now()
        ? 'expired'
        : 'active',
  }));
}

/** Makes a link for an employee. The address is shown once (and e-mailed when asked); only the hash of the token is kept. */
export async function issueLink(
  actor: Actor,
  employeeId: string,
  input: unknown,
): Promise<{ link: string; expiresAt: string; emailed: boolean }> {
  const companyId = need(actor);
  const parsed = linkInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The link is not valid.');
  const d = parsed.data;
  const { employee } = await payDetails(companyId, employeeId);
  if (d.sendEmail && !d.otpRequired)
    throw new ValidationError('A link sent by e-mail needs the one-time code.');
  const issued = await getService('tokens').issue({
    docType: 'payslip',
    docId: employeeId,
    companyId,
    ttlDays: d.ttlDays,
    otpRequired: d.otpRequired,
  });
  const { error } = await getAdminSupabase().from('employee_portal_links').insert({
    company_id: companyId,
    employee_id: employeeId,
    token_id: issued.id,
    issued_by: actor.userId,
    expires_at: issued.expiresAt,
    otp_required: d.otpRequired,
  });
  if (error) mapAccountingError(error);
  const link = portalUrl(siteUrl(), issued.token);
  let emailed = false;
  if (d.sendEmail) {
    try {
      const company = await getAdminSupabase()
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle();
      await getService('email').send({
        template: 'payroll.portal-link',
        to: employee.email,
        companyId,
        idempotencyKey: `payroll-portal:${issued.id}`,
        data: {
          firstName: employee.firstName,
          companyName: String(company.data?.name ?? ''),
          link,
          expiresAt: issued.expiresAt.slice(0, 10),
        },
      });
      await getAdminSupabase()
        .from('employee_portal_links')
        .update({ sent_at: new Date().toISOString() })
        .eq('token_id', issued.id);
      emailed = true;
    } catch (e) {
      log.error('portal link not e-mailed', { employeeId, error: String(e) });
    }
  }
  await audit(companyId, 'payroll.portal_link_issued', employeeId, {
    ttlDays: d.ttlDays,
    otp: d.otpRequired,
    emailed,
  });
  return { link: emailed ? '' : link, expiresAt: issued.expiresAt, emailed };
}

export async function revokeLink(actor: Actor, linkId: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('employee_portal_links')
    .select('token_id, employee_id, revoked_at')
    .eq('company_id', companyId)
    .eq('id', linkId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  if (data.revoked_at) return;
  await getService('tokens').revoke(String(data.token_id));
  const up = await getAdminSupabase()
    .from('employee_portal_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (up.error) mapAccountingError(up.error);
  await audit(companyId, 'payroll.portal_link_revoked', String(data.employee_id), { linkId });
}

/* ---------- what the employee sees ---------- */

export interface PortalView {
  employeeName: string;
  companyName: string;
  payslips: PortalItem[];
  declaration: {
    status: 'pending' | 'approved' | 'rejected';
    filingStatus: string;
    allowances: number;
    rejectReason: string | null;
  } | null;
}

type OkAccess = Extract<PortalAccess, { state: 'ok' }>;

export async function portalView(access: OkAccess): Promise<PortalView> {
  const admin = getAdminSupabase();
  const emp = await admin
    .from('employees')
    .select('first_name, last_name')
    .eq('company_id', access.companyId)
    .eq('id', access.docId)
    .is('deleted_at', null)
    .maybeSingle();
  if (emp.error) throw new InternalError(emp.error);
  if (!emp.data) throw new NotFoundError();
  const company = await admin
    .from('companies')
    .select('name')
    .eq('id', access.companyId)
    .maybeSingle();
  const items = await admin
    .from('pay_run_items')
    .select(
      'id, period_start, period_end, net, payslip_file_id, pay_runs!inner(run_number, pay_date, status)',
    )
    .eq('company_id', access.companyId)
    .eq('employee_id', access.docId)
    .eq('active', true)
    .is('deleted_at', null)
    .in('pay_runs.status', ['approved', 'paid'])
    .order('period_end', { ascending: false })
    .limit(60);
  if (items.error) throw new InternalError(items.error);
  const rows: PortalItem[] = (items.data ?? []).map((r) => {
    const run = (
      r as unknown as {
        pay_runs:
          | { run_number: string; pay_date: string; status: string }
          | { run_number: string; pay_date: string; status: string }[];
      }
    ).pay_runs;
    const x = Array.isArray(run) ? run[0] : run;
    return {
      itemId: String(r.id),
      runNumber: x?.run_number ?? '',
      periodStart: String(r.period_start),
      periodEnd: String(r.period_end),
      payDate: x?.pay_date ?? '',
      net: Money.parseRounded(String(r.net)).toDbString(),
      runStatus: x?.status ?? '',
      hasFile: r.payslip_file_id !== null,
    };
  });
  const decl = await admin
    .from('employee_declarations')
    .select('status, filing_status, allowances, reject_reason')
    .eq('company_id', access.companyId)
    .eq('employee_id', access.docId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (decl.error) throw new InternalError(decl.error);
  const d = decl.data?.[0];
  return {
    employeeName: `${String(emp.data.first_name)} ${String(emp.data.last_name)}`,
    companyName: String(company.data?.name ?? ''),
    payslips: visiblePayslips(rows),
    declaration: d
      ? {
          status:
            d.status === 'approved' ? 'approved' : d.status === 'rejected' ? 'rejected' : 'pending',
          filingStatus: String(d.filing_status),
          allowances: toInt(d.allowances),
          rejectReason: d.reject_reason ? String(d.reject_reason) : null,
        }
      : null,
  };
}

/** The address of a payslip of this employee only; a payslip of anyone else looks like a missing one. Every opening is recorded. */
export async function portalPayslipLink(access: OkAccess, itemId: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('pay_run_items')
    .select('payslip_file_id, run_id, pay_runs!inner(status)')
    .eq('company_id', access.companyId)
    .eq('employee_id', access.docId)
    .eq('id', itemId)
    .eq('active', true)
    .is('deleted_at', null)
    .in('pay_runs.status', ['approved', 'paid'])
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data || !data.payslip_file_id) throw new NotFoundError();
  await recordPortalEvent(access, 'pdf_download');
  await audit(access.companyId, 'payroll.payslip_opened_by_employee', access.docId, {
    itemId,
    runId: String(data.run_id),
  });
  return getService('storage').signedUrl(String(data.payslip_file_id), 120);
}

/* ---------- tax declarations ---------- */

export async function submitDeclaration(access: OkAccess, input: unknown): Promise<void> {
  const parsed = declarationInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The declaration is not valid.');
  const d = parsed.data;
  const { error } = await getAdminSupabase().from('employee_declarations').insert({
    company_id: access.companyId,
    employee_id: access.docId,
    filing_status: d.filingStatus,
    allowances: d.allowances,
    note: d.note,
    token_id: access.tokenId,
  });
  if (error) {
    if (error.code === '23505')
      throw new ConflictError('You already have a declaration waiting for a decision.');
    mapAccountingError(error);
  }
  await audit(access.companyId, 'payroll.declaration_sent', access.docId, {
    allowances: d.allowances,
  });
  await getService('notification')
    .notify({
      companyId: access.companyId,
      type: 'payroll.declaration',
      title: 'A tax declaration was sent',
      body: 'An employee sent a tax declaration for your decision.',
      href: '/payroll/declarations',
    })
    .catch((e: unknown) => log.error('declaration notice not sent', { error: String(e) }));
}

export interface DeclarationView {
  id: string;
  employeeId: string;
  employeeName: string;
  filingStatus: string;
  allowances: number;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export async function listDeclarations(
  companyId: string,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<DeclarationView[]> {
  let q = getAdminSupabase()
    .from('employee_declarations')
    .select(
      'id, employee_id, filing_status, allowances, note, status, created_at, employees:employee_id(first_name, last_name)',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => {
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
      filingStatus: String(r.filing_status),
      allowances: toInt(r.allowances),
      note: String(r.note),
      status:
        r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending',
      createdAt: String(r.created_at),
    };
  });
}

/** The owner approves (the employee's tax details change) or rejects (with a reason) a declaration. */
export async function decideDeclaration(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<DeclarationView> {
  const companyId = need(actor);
  const parsed = decideDeclarationInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The decision is not valid.');
  const d = parsed.data;
  const found = (await listDeclarations(companyId)).find((x) => x.id === id);
  if (!found) throw new NotFoundError();
  if (found.status !== 'pending') throw new ConflictError('This declaration was already decided.');
  const admin = getAdminSupabase();
  if (d.decision === 'approve') {
    const permissions = getService('permissions');
    if (!(await permissions.can(actor, 'payroll.pay.manage', { type: 'employee' })))
      throw new ForbiddenError();
    const row = await admin
      .from('employees')
      .select('version, tax_enc')
      .eq('company_id', companyId)
      .eq('id', found.employeeId)
      .maybeSingle();
    if (row.error) throw new InternalError(row.error);
    if (!row.data) throw new NotFoundError();
    const merged = mergeDeclaration(await getTaxInfo(companyId, found.employeeId), found);
    if (!merged)
      throw new ValidationError('Add the tax identification number of this employee first.');
    const checked = taxInfo.safeParse(merged);
    if (!checked.success) throw new ValidationError('The tax details are not valid.');
    await updateEmployee(actor, found.employeeId, {
      version: toInt(row.data.version),
      tax: checked.data,
    });
  }
  const { data, error } = await admin
    .from('employee_declarations')
    .update(
      d.decision === 'approve'
        ? { status: 'approved', decided_by: actor.userId, decided_at: new Date().toISOString() }
        : {
            status: 'rejected',
            decided_by: actor.userId,
            decided_at: new Date().toISOString(),
            reject_reason: d.reason,
          },
    )
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new ConflictError('Someone else decided this declaration.');
  await audit(
    companyId,
    d.decision === 'approve' ? 'payroll.declaration_approved' : 'payroll.declaration_rejected',
    found.employeeId,
    { declarationId: id },
  );
  return (await listDeclarations(companyId)).find((x) => x.id === id) as DeclarationView;
}
