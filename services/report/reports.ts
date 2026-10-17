// path: services/report/reports.ts
// The report catalogue. Each report fetches plain rows for the signed-in company (never more than 20000) and hands them to
// the pure sums in lib/reports/aggregate.ts. Other STEPs add their own reports (payments by method, expenses, profit and
// loss, cash flow) with `registerReport`, so this file never reads their tables.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  creditsReport,
  estimatesFunnel,
  paymentsReceived,
  receivablesAging,
  revenueByClient,
  revenueByItem,
  salesSummary,
  statusSummary,
  taxSummary,
  timeSummary,
  type CreditFact,
  type EstimateFact,
  type InvoiceFact,
  type ItemFact,
  type PaymentFact,
  type TimeFact,
} from '@/lib/reports/aggregate';
import { compareTotals, type ComparisonRow } from '@/lib/reports/compare';
import {
  reportParamsSchema,
  resolveParams,
  type ReportParams,
  type ResolvedParams,
} from '@/lib/reports/params';
import { MAX_REPORT_ROWS, type ReportResult } from '@/lib/reports/types';
import { addDays } from '@/lib/invoice/terms';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listMembers } from '@/services/team/members';
import type { Actor } from '@/types/contracts';

type Row = Record<string, unknown>;
const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();
const tooMany = (): never => {
  throw new ValidationError('That is more than 20000 rows. Choose a shorter period.');
};

export type ReportCategory = 'sales' | 'receivables' | 'tax' | 'time' | 'other';

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  category: ReportCategory;
  /** Permission needed besides report.read (for example a report from another STEP). */
  extraPermission?: string;
  usesPeriod: boolean;
  groupable: boolean;
  run(companyId: string, p: ResolvedParams): Promise<ReportResult>;
}

const extra = new Map<string, ReportDefinition>();

/** Other STEPs register their reports here (from their register file). */
export function registerReport(def: ReportDefinition): void {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(def.key)) throw new Error(`Bad report key: ${def.key}`);
  extra.set(def.key, def);
}

// ---------- loaders ----------

const INVOICE_COLUMNS =
  'id, number, client_id, walk_in_name, bill_to, kind, status, issue_date, due_date, sent_at, total, tax_total, amount_due, amount_paid, tax_breakdown, project_id';

function toInvoiceFact(r: Row): InvoiceFact {
  const bill = (r.bill_to ?? {}) as { name?: string };
  return {
    id: String(r.id),
    number: r.number ? String(r.number) : null,
    clientId: r.client_id ? String(r.client_id) : null,
    clientName: bill.name || String(r.walk_in_name ?? ''),
    kind: String(r.kind),
    status: String(r.status),
    issueDate: String(r.issue_date),
    dueDate: String(r.due_date),
    sentAt: r.sent_at ? String(r.sent_at) : null,
    total: dec(r.total),
    taxTotal: dec(r.tax_total),
    amountDue: dec(r.amount_due),
    amountPaid: dec(r.amount_paid),
    taxBreakdown: ((r.tax_breakdown as InvoiceFact['taxBreakdown'] | null) ?? []).map((t) => ({
      code: t.code,
      rate: t.rate,
      base: dec(t.base),
      amount: dec(t.amount),
    })),
    projectId: r.project_id ? String(r.project_id) : null,
  };
}

async function sentInvoices(companyId: string, from: string, to: string): Promise<InvoiceFact[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .not('sent_at', 'is', null)
    .gte('sent_at', `${from}T00:00:00Z`)
    .lt('sent_at', `${addDays(to, 1)}T00:00:00Z`)
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  return (data ?? []).map((r) => toInvoiceFact(r as unknown as Row));
}

async function issuedInvoices(companyId: string, from: string, to: string): Promise<InvoiceFact[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('issue_date', from)
    .lte('issue_date', to)
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  return (data ?? []).map((r) => toInvoiceFact(r as unknown as Row));
}

async function openInvoices(companyId: string): Promise<InvoiceFact[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['sent', 'viewed', 'partially_paid', 'overdue', 'disputed'])
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  return (data ?? []).map((r) => toInvoiceFact(r as unknown as Row));
}

async function creditFacts(companyId: string, from: string, to: string): Promise<CreditFact[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('credit_notes')
    .select(
      'id, number, walk_in_name, bill_to, invoice_id, issue_date, status, reason, total, tax_total, applied_amount, tax_breakdown',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('issue_date', from)
    .lte('issue_date', to)
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  const ids = [...new Set((data ?? []).map((r) => String(r.invoice_id)))];
  const numbers = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const inv = await admin
      .from('invoices')
      .select('id, number')
      .eq('company_id', companyId)
      .in('id', ids.slice(i, i + 200));
    if (inv.error) throw new InternalError(inv.error);
    for (const x of inv.data ?? []) numbers.set(String(x.id), x.number ? String(x.number) : '');
  }
  return (data ?? []).map((r) => {
    const bill = (r.bill_to ?? {}) as { name?: string };
    return {
      id: String(r.id),
      number: r.number ? String(r.number) : null,
      clientName: bill.name || String(r.walk_in_name ?? ''),
      invoiceNumber: numbers.get(String(r.invoice_id)) ?? '',
      issueDate: String(r.issue_date),
      status: String(r.status),
      reason: String(r.reason),
      total: dec(r.total),
      taxTotal: dec(r.tax_total),
      appliedAmount: dec(r.applied_amount),
      taxBreakdown: ((r.tax_breakdown as CreditFact['taxBreakdown'] | null) ?? []).map((t) => ({
        code: t.code,
        rate: t.rate,
        base: dec(t.base),
        amount: dec(t.amount),
      })),
    };
  });
}

async function cashPayments(companyId: string, from: string, to: string): Promise<PaymentFact[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('invoice_payment_links')
    .select('id, invoice_id, payment_id, amount, applied_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('applied_at', `${from}T00:00:00Z`)
    .lt('applied_at', `${addDays(to, 1)}T00:00:00Z`)
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  const apps = await admin
    .from('credit_applications')
    .select('id')
    .eq('company_id', companyId)
    .gte('created_at', `${addDays(from, -1)}T00:00:00Z`)
    .lt('created_at', `${addDays(to, 2)}T00:00:00Z`)
    .limit(MAX_REPORT_ROWS);
  if (apps.error) throw new InternalError(apps.error);
  const settlements = new Set((apps.data ?? []).map((a) => String(a.id)));
  const cash = (data ?? []).filter((l) => !settlements.has(String(l.payment_id)));
  const ids = [...new Set(cash.map((l) => String(l.invoice_id)))];
  const info = new Map<string, { number: string; client: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const inv = await admin
      .from('invoices')
      .select('id, number, walk_in_name, bill_to')
      .eq('company_id', companyId)
      .in('id', ids.slice(i, i + 200));
    if (inv.error) throw new InternalError(inv.error);
    for (const x of inv.data ?? []) {
      const bill = (x.bill_to ?? {}) as { name?: string };
      info.set(String(x.id), {
        number: x.number ? String(x.number) : '',
        client: bill.name || String(x.walk_in_name ?? ''),
      });
    }
  }
  return cash.map((l) => ({
    id: String(l.id),
    invoiceNumber: info.get(String(l.invoice_id))?.number ?? '',
    clientName: info.get(String(l.invoice_id))?.client ?? '',
    amount: dec(l.amount),
    at: String(l.applied_at),
  }));
}

async function itemFacts(companyId: string, invoices: InvoiceFact[]): Promise<ItemFact[]> {
  const admin = getAdminSupabase();
  const ids = invoices.map((i) => i.id);
  const out: ItemFact[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from('invoice_items')
      .select('sku, description, quantity, net, tax, line_total')
      .eq('company_id', companyId)
      .in('invoice_id', ids.slice(i, i + 100))
      .is('deleted_at', null)
      .limit(MAX_REPORT_ROWS + 1);
    if (error) throw new InternalError(error);
    for (const r of data ?? [])
      out.push({
        sku: String(r.sku ?? ''),
        description: String(r.description),
        quantity: dec(r.quantity),
        net: dec(r.net),
        tax: dec(r.tax),
        lineTotal: dec(r.line_total),
      });
    if (out.length > MAX_REPORT_ROWS) tooMany();
  }
  return out;
}

async function timeFacts(companyId: string, from: string, to: string): Promise<TimeFact[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('time_entries')
    .select('project_id, user_id, hours, billable, rate, status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .is('timer_started_at', null)
    .gte('work_date', from)
    .lte('work_date', to)
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  const projectIds = [...new Set((data ?? []).map((r) => String(r.project_id)))];
  const names = new Map<string, string>();
  for (let i = 0; i < projectIds.length; i += 200) {
    const p = await admin
      .from('projects')
      .select('id, name')
      .eq('company_id', companyId)
      .in('id', projectIds.slice(i, i + 200));
    if (p.error) throw new InternalError(p.error);
    for (const x of p.data ?? []) names.set(String(x.id), String(x.name));
  }
  const team = await listMembers(companyId).catch(() => []);
  const people = new Map(team.map((m) => [m.userId, m.name || m.email]));
  return (data ?? []).map((r) => ({
    projectId: String(r.project_id),
    projectName: names.get(String(r.project_id)) ?? '',
    userId: String(r.user_id),
    userName: people.get(String(r.user_id)) ?? 'Former team member',
    hours: dec(r.hours),
    billable: r.billable === true,
    rate: dec(r.rate),
    status: String(r.status),
  }));
}

async function estimateFacts(companyId: string, from: string, to: string): Promise<EstimateFact[]> {
  const { data, error } = await getAdminSupabase()
    .from('estimates')
    .select('status, total')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('created_at', `${from}T00:00:00Z`)
    .lt('created_at', `${addDays(to, 1)}T00:00:00Z`)
    .limit(MAX_REPORT_ROWS + 1);
  if (error) throw new InternalError(error);
  if ((data ?? []).length > MAX_REPORT_ROWS) tooMany();
  return (data ?? []).map((r) => ({ status: String(r.status), total: dec(r.total) }));
}

// ---------- catalogue ----------

const builtIn: ReportDefinition[] = [
  {
    key: 'sales_summary',
    title: 'Sales summary',
    description: 'What you invoiced each month, with credit notes taken off.',
    category: 'sales',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) =>
      salesSummary(
        await sentInvoices(c, p.from, p.to),
        await creditFacts(c, p.from, p.to),
        p.from,
        p.to,
      ),
  },
  {
    key: 'revenue_by_client',
    title: 'Revenue by client',
    description: 'Invoiced, collected and still unpaid for each client.',
    category: 'sales',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) =>
      revenueByClient(
        await sentInvoices(c, p.from, p.to),
        await cashPayments(c, p.from, p.to),
        p.from,
        p.to,
      ),
  },
  {
    key: 'revenue_by_item',
    title: 'Revenue by item',
    description: 'Quantities and net sales of each product or service you sold.',
    category: 'sales',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) => {
      const sales = (await sentInvoices(c, p.from, p.to)).filter(
        (i) => (i.kind === 'invoice' || i.kind === 'debit_note') && i.status !== 'void',
      );
      return revenueByItem(await itemFacts(c, sales), p.from, p.to);
    },
  },
  {
    key: 'invoice_status',
    title: 'Invoices by status',
    description: 'How many invoices are draft, sent, paid, overdue or void.',
    category: 'sales',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) => statusSummary(await issuedInvoices(c, p.from, p.to), p.from, p.to),
  },
  {
    key: 'payments_received',
    title: 'Payments received',
    description: 'Every payment applied to an invoice, in date order.',
    category: 'receivables',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) => paymentsReceived(await cashPayments(c, p.from, p.to), p.from, p.to),
  },
  {
    key: 'ar_aging',
    title: 'Unpaid invoices by age',
    description: 'Who owes you what, and how late it is.',
    category: 'receivables',
    usesPeriod: false,
    groupable: false,
    run: async (c, p) => receivablesAging(await openInvoices(c), p.today),
  },
  {
    key: 'credit_notes',
    title: 'Credit notes',
    description: 'Credit notes issued in the period and how much was applied.',
    category: 'receivables',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) => creditsReport(await creditFacts(c, p.from, p.to), p.from, p.to),
  },
  {
    key: 'tax_summary',
    title: 'Tax summary',
    description: 'Tax charged and credited for each tax rate, ready for your return.',
    category: 'tax',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) =>
      taxSummary(
        await sentInvoices(c, p.from, p.to),
        await creditFacts(c, p.from, p.to),
        p.from,
        p.to,
      ),
  },
  {
    key: 'time_summary',
    title: 'Time',
    description: 'Hours, billable share and value of time by project or by person.',
    category: 'time',
    usesPeriod: true,
    groupable: true,
    run: async (c, p) => timeSummary(await timeFacts(c, p.from, p.to), p.groupBy, p.from, p.to),
  },
  {
    key: 'estimates_funnel',
    title: 'Estimates',
    description: 'Estimates by status and how many were accepted.',
    category: 'other',
    usesPeriod: true,
    groupable: false,
    run: async (c, p) => estimatesFunnel(await estimateFacts(c, p.from, p.to), p.from, p.to),
  },
];

export function reportCatalog(): ReportDefinition[] {
  return [...builtIn, ...extra.values()];
}

export function findReport(key: string): ReportDefinition {
  const def = reportCatalog().find((d) => d.key === key);
  if (!def) throw new NotFoundError();
  return def;
}

export interface ReportRun {
  definition: {
    key: string;
    title: string;
    description: string;
    usesPeriod: boolean;
    groupable: boolean;
  };
  params: ResolvedParams;
  result: ReportResult;
  comparison: { previous: ReportResult; rows: ComparisonRow[] } | null;
}

/** Runs a report without a person (the schedule job). The caller has already decided it may run. */
export async function executeReport(
  companyId: string,
  key: string,
  input: ReportParams,
): Promise<ReportRun> {
  const def = findReport(key);
  const parsed = reportParamsSchema.parse(input);
  const params = resolveParams(parsed, new Date().toISOString().slice(0, 10));
  const result = await def.run(companyId, params);
  return {
    definition: {
      key: def.key,
      title: def.title,
      description: def.description,
      usesPeriod: def.usesPeriod,
      groupable: def.groupable,
    },
    params,
    result,
    comparison: null,
  };
}

/** Runs one report for the signed-in person after the permission checks. */
export async function runReport(
  actor: Actor,
  key: string,
  input: ReportParams,
): Promise<ReportRun> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const def = findReport(key);
  const perms = getService('permissions');
  if (!(await perms.can(actor, 'report.read', { type: 'report' }))) throw new ForbiddenError();
  if (def.extraPermission && !(await perms.can(actor, def.extraPermission, { type: 'report' })))
    throw new ForbiddenError();
  const parsed = reportParamsSchema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the report options.');
  const params = resolveParams(parsed.data, new Date().toISOString().slice(0, 10));
  const result = await def.run(actor.companyId, params);
  let comparison: ReportRun['comparison'] = null;
  if (params.compare && def.usesPeriod) {
    const previous = await def.run(actor.companyId, {
      ...params,
      from: params.previous.from,
      to: params.previous.to,
    });
    comparison = { previous, rows: compareTotals(result, previous) };
  }
  return {
    definition: {
      key: def.key,
      title: def.title,
      description: def.description,
      usesPeriod: def.usesPeriod,
      groupable: def.groupable,
    },
    params,
    result,
    comparison,
  };
}
