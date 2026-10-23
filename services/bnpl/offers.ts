// path: services/bnpl/offers.ts
// Who is offered installments and what the offer looks like for an invoice. The answer for the owner lists the reasons a
// client is not offered; the answer for the checkout is only the offers.
import 'server-only';
import { InternalError } from '@/lib/errors';
import {
  eligibility,
  offers,
  addDays,
  type Eligibility,
  type Offer,
} from '@/lib/payment/bnpl-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import { getInvoice } from '@/services/invoice/invoices';
import { getBnplPartner } from './partners';
import { loadBnplRules } from './settings';

export interface OfferAnswer extends Eligibility {
  offers: Offer[];
  partner: string;
}

async function clientHistory(
  companyId: string,
  clientId: string | null,
): Promise<{ paid: number; overdue: number; risk: 'none' | 'watch' | 'high' }> {
  if (!clientId) return { paid: 0, overdue: 0, risk: 'none' };
  const admin = getAdminSupabase();
  const [paid, overdue, client] = await Promise.all([
    admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .eq('status', 'paid')
      .is('deleted_at', null),
    admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .eq('status', 'overdue')
      .is('deleted_at', null),
    admin
      .from('clients')
      .select('risk_flag')
      .eq('id', clientId)
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);
  if (paid.error) throw new InternalError(paid.error);
  if (overdue.error) throw new InternalError(overdue.error);
  if (client.error) throw new InternalError(client.error);
  const flag = String(client.data?.risk_flag ?? 'none');
  return {
    paid: paid.count ?? 0,
    overdue: overdue.count ?? 0,
    risk: flag === 'high' || flag === 'watch' ? flag : 'none',
  };
}

export async function livePlanExists(companyId: string, invoiceId: string): Promise<boolean> {
  const { count, error } = await getAdminSupabase()
    .from('bnpl_plans')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .in('status', ['active', 'completed', 'defaulted'])
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return (count ?? 0) > 0;
}

/** Eligibility and offers for one invoice (first part due today, then monthly). */
export async function offersForInvoice(
  companyId: string,
  invoiceId: string,
  today: string = new Date().toISOString().slice(0, 10),
  partnerId = 'in_house',
): Promise<OfferAnswer> {
  const [rules, invoice, hasLivePlan] = await Promise.all([
    loadBnplRules(companyId),
    getInvoice(companyId, invoiceId),
    livePlanExists(companyId, invoiceId),
  ]);
  const history = await clientHistory(companyId, invoice.clientId);
  const facts = {
    invoiceStatus: invoice.status,
    amountDue: invoice.totals.amountDue,
    amountPaid: invoice.amountPaid,
    hasLivePlan,
    paidInvoices: history.paid,
    overdueInvoices: history.overdue,
    riskFlag: history.risk,
  };
  const partner = getBnplPartner(partnerId);
  const base = eligibility(facts, rules);
  const outside = partner ? await partner.creditCheck(facts) : null;
  const result: Eligibility =
    outside && !outside.eligible
      ? { eligible: false, reasons: [...base.reasons, ...outside.reasons] }
      : base;
  return {
    ...result,
    offers: result.eligible ? offers(invoice.totals.amountDue, rules, addDays(today, 0)) : [],
    partner: partnerId,
  };
}

export interface OfferableInvoice {
  id: string;
  number: string;
  amountDue: string;
}

/** Sent invoices with nothing paid and no plan yet: the ones the owner can offer installments for. */
export async function offerableInvoices(companyId: string): Promise<OfferableInvoice[]> {
  const admin = getAdminSupabase();
  const [{ data, error }, live] = await Promise.all([
    admin
      .from('invoices')
      .select('id, number, amount_due, amount_paid')
      .eq('company_id', companyId)
      .eq('kind', 'invoice')
      .in('status', ['sent', 'viewed', 'overdue'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('bnpl_plans')
      .select('invoice_id')
      .eq('company_id', companyId)
      .in('status', ['active', 'completed', 'defaulted'])
      .is('deleted_at', null),
  ]);
  if (error) throw new InternalError(error);
  if (live.error) throw new InternalError(live.error);
  const taken = new Set((live.data ?? []).map((r) => String(r.invoice_id)));
  return (data ?? [])
    .filter((r) => !taken.has(String(r.id)) && Money.parse(String(r.amount_paid)).isZero())
    .map((r) => ({
      id: String(r.id),
      number: String(r.number ?? ''),
      amountDue: String(r.amount_due),
    }));
}
