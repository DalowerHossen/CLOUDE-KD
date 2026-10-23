// path: services/invoice/client-hooks.ts
// What STEP 08 asked the invoicing STEP to register (docs/steps/STEP-08/DEPENDENCY_REQUESTS.md): delete guards for
// clients, products and variants that are on invoices, the client statement, timeline and personal-data export, the merge
// of two clients, and the anonymize step. Client balances need no code here: a database trigger keeps them current.
import { InternalError } from '@/lib/errors';
import { registerProductDeleteGuard } from '@/lib/catalog/hooks';
import { registerVariantRemoveGuard } from '@/lib/catalog/variant-hooks';
import {
  registerClientAnonymize,
  registerClientDeleteGuard,
  registerClientExport,
  registerClientMergeHandler,
  registerClientStatement,
  registerClientTimeline,
} from '@/lib/crm/hooks';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

const OPEN = ['sent', 'viewed', 'partially_paid', 'overdue', 'disputed'];

async function count(
  table: string,
  companyId: string,
  column: string,
  id: string,
): Promise<number> {
  const { count: n, error } = await getAdminSupabase()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq(column, id)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return n ?? 0;
}

export function registerClientHooks(): void {
  registerClientDeleteGuard('invoice', async (companyId, clientId) => {
    const [invoices, estimates, credits, projects] = await Promise.all([
      count('invoices', companyId, 'client_id', clientId),
      count('estimates', companyId, 'client_id', clientId),
      count('credit_notes', companyId, 'client_id', clientId),
      count('projects', companyId, 'client_id', clientId),
    ]);
    const parts = [
      invoices > 0 ? `${invoices} invoices` : '',
      estimates > 0 ? `${estimates} estimates` : '',
      credits > 0 ? `${credits} credit notes` : '',
      projects > 0 ? `${projects} projects` : '',
    ].filter((x) => x !== '');
    return parts.length > 0
      ? `This client has ${parts.join(', ')}. Archive the client instead of deleting it.`
      : null;
  });

  registerProductDeleteGuard('invoice', async (companyId, productId) => {
    const n = await count('invoice_items', companyId, 'product_id', productId);
    return n > 0 ? `This item is on ${n} invoice lines. Archive it instead of deleting it.` : null;
  });

  registerVariantRemoveGuard('invoice', async (companyId, variantId) => {
    const n = await count('invoice_items', companyId, 'variant_id', variantId);
    return n > 0 ? `This variant is on ${n} invoice lines.` : null;
  });

  registerClientMergeHandler('invoice', async (companyId, fromId, intoId) => {
    const { error } = await getAdminSupabase().rpc('kd_invoice_merge_client', {
      p_company: companyId,
      p_from: fromId,
      p_into: intoId,
    });
    if (error) throw new InternalError(error);
  });

  registerClientStatement('invoice', async (companyId, clientId, range) => {
    const admin = getAdminSupabase();
    const open = await admin
      .from('invoices')
      .select('number, issue_date, due_date, amount_due, amount_paid')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .in('status', OPEN)
      .in('kind', ['invoice', 'debit_note', 'deposit'])
      .is('deleted_at', null)
      .order('issue_date', { ascending: true })
      .limit(2000);
    if (open.error) throw new InternalError(open.error);
    const docs = await admin
      .from('invoices')
      .select('id, number')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .limit(5000);
    if (docs.error) throw new InternalError(docs.error);
    const byId = new Map((docs.data ?? []).map((d) => [String(d.id), String(d.number ?? '')]));
    const links = byId.size
      ? await admin
          .from('invoice_payment_links')
          .select('invoice_id, amount, applied_at')
          .eq('company_id', companyId)
          .in('invoice_id', [...byId.keys()].slice(0, 1000))
          .gte('applied_at', `${range.from}T00:00:00Z`)
          .lte('applied_at', `${range.to}T23:59:59Z`)
          .is('deleted_at', null)
          .order('applied_at', { ascending: true })
          .limit(2000)
      : { data: [], error: null };
    if (links.error) throw new InternalError(links.error);
    return {
      documents: (open.data ?? []).map((r) => ({
        number: String(r.number ?? ''),
        issuedOn: String(r.issue_date),
        dueOn: String(r.due_date),
        due: Money.parseRounded(String(r.amount_due)).sub(String(r.amount_paid)),
      })),
      payments: (links.data ?? []).map((l) => ({
        on: String(l.applied_at).slice(0, 10),
        reference: byId.get(String(l.invoice_id)) ?? '',
        amount: Money.parseRounded(String(l.amount)),
      })),
    };
  });

  registerClientTimeline('invoice', async (companyId, clientId, limit) => {
    const admin = getAdminSupabase();
    const [invoices, estimates] = await Promise.all([
      admin
        .from('invoices')
        .select('id, number, status, total, sent_at, created_at')
        .eq('company_id', companyId)
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit),
      admin
        .from('estimates')
        .select('id, number, status, total, created_at')
        .eq('company_id', companyId)
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);
    if (invoices.error) throw new InternalError(invoices.error);
    if (estimates.error) throw new InternalError(estimates.error);
    const entries = [
      ...(invoices.data ?? []).map((r) => ({
        at: String(r.sent_at ?? r.created_at),
        kind: 'invoice',
        title: `Invoice ${r.number ? String(r.number) : '(draft)'}`,
        detail: `${String(r.status)} - ${Money.parseRounded(String(r.total)).toDbString()}`,
        href: `/invoices/${String(r.id)}`,
      })),
      ...(estimates.data ?? []).map((r) => ({
        at: String(r.created_at),
        kind: 'estimate',
        title: `Estimate ${r.number ? String(r.number) : '(draft)'}`,
        detail: `${String(r.status)} - ${Money.parseRounded(String(r.total)).toDbString()}`,
        href: `/estimates/${String(r.id)}`,
      })),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  });

  registerClientExport('invoice', async (companyId, clientId) => {
    const { data, error } = await getAdminSupabase()
      .from('invoices')
      .select('number, kind, status, issue_date, due_date, total, amount_paid')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('issue_date', { ascending: true })
      .limit(5000);
    if (error) throw new InternalError(error);
    return {
      section: 'invoices',
      rows: (data ?? []).map((r) => ({
        number: r.number,
        kind: r.kind,
        status: r.status,
        issueDate: r.issue_date,
        dueDate: r.due_date,
        total: Money.parseRounded(String(r.total)).toDbString(),
        paid: Money.parseRounded(String(r.amount_paid)).toDbString(),
      })),
    };
  });

  registerClientExport('estimate', async (companyId, clientId) => {
    const { data, error } = await getAdminSupabase()
      .from('estimates')
      .select('number, status, valid_until, total')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .limit(5000);
    if (error) throw new InternalError(error);
    return {
      section: 'estimates',
      rows: (data ?? []).map((r) => ({
        number: r.number,
        status: r.status,
        validUntil: r.valid_until,
        total: Money.parseRounded(String(r.total)).toDbString(),
      })),
    };
  });

  // Sent invoices, credit notes and payments are legal records and stay as they are. What can go: the contact details
  // kept in estimates and schedules, and the schedules themselves stop.
  registerClientAnonymize('invoice', async (companyId, clientId) => {
    const admin = getAdminSupabase();
    const est = await admin
      .from('estimates')
      .select('id, input, status, version')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .in('status', ['draft', 'declined', 'expired', 'void'])
      .is('deleted_at', null)
      .limit(2000);
    if (est.error) throw new InternalError(est.error);
    for (const e of est.data ?? []) {
      const input = (e.input ?? {}) as { billTo?: Record<string, unknown> };
      const billTo = { ...(input.billTo ?? {}), contactName: '', email: '', phone: '' };
      const r = await admin
        .from('estimates')
        .update({ input: { ...input, billTo }, version: toInt(e.version, 1) + 1 })
        .eq('id', String(e.id))
        .eq('company_id', companyId);
      if (r.error) throw new InternalError(r.error);
    }
    const sch = await admin
      .from('recurring_schedules')
      .update({ status: 'ended', next_run_date: null })
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .neq('status', 'ended')
      .is('deleted_at', null);
    if (sch.error) throw new InternalError(sch.error);
  });
}
