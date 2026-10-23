// path: services/taxfiling/tax-data.ts
// Reads the tax facts of a company for a period: the tax charged on invoices (from the tax breakdown each invoice keeps), the
// tax paid on supplier bills and approved expenses, the tax rates (for jurisdiction and kind) and the payments recorded.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { InputTaxLine, InvoiceTax, RateInfo } from './tax-rules';

const INVOICED = ['sent', 'viewed', 'partially_paid', 'paid', 'overdue'];

export async function loadRates(companyId: string): Promise<Map<string, RateInfo>> {
  const { data, error } = await getAdminSupabase()
    .from('tax_rates')
    .select('code, name, kind, country, region')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .limit(1000);
  if (error) throw new InternalError(error);
  return new Map(
    (data ?? []).map((r) => [
      String(r.code),
      {
        code: String(r.code),
        name: String(r.name),
        kind: String(r.kind),
        country: r.country ? String(r.country) : null,
        region: String(r.region ?? ''),
      },
    ]),
  );
}

interface BreakdownRow {
  code?: string;
  name?: string;
  rate?: string;
  base?: string;
  amount?: string;
}

export async function loadInvoiceTax(
  companyId: string,
  from: string,
  to: string,
): Promise<InvoiceTax[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select(
      'id, client_id, bill_to, issue_date, tax_breakdown, withholding_rate, withholding, total',
    )
    .eq('company_id', companyId)
    .eq('kind', 'invoice')
    .in('status', INVOICED)
    .gte('issue_date', from)
    .lte('issue_date', to)
    .is('deleted_at', null)
    .limit(20_000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => {
    const name = String((r.bill_to as { name?: string } | null)?.name ?? '') || 'Walk-in';
    const rows = (Array.isArray(r.tax_breakdown) ? (r.tax_breakdown as BreakdownRow[]) : [])
      .filter((x) => typeof x.code === 'string')
      .map((x) => ({
        code: String(x.code),
        name: String(x.name ?? x.code),
        rate: Money.parseRounded(String(x.rate ?? '0')).toDbString(),
        base: Money.parseRounded(String(x.base ?? '0')).toDbString(),
        amount: Money.parseRounded(String(x.amount ?? '0')).toDbString(),
      }));
    return {
      id: String(r.id),
      clientKey: r.client_id ? String(r.client_id) : `name:${name}`,
      clientName: name,
      issueDate: String(r.issue_date),
      rows,
      withholdingRate: Money.parseRounded(String(r.withholding_rate ?? '0')).toDbString(),
      withholding: Money.parseRounded(String(r.withholding ?? '0')).toDbString(),
      total: Money.parseRounded(String(r.total ?? '0')).toDbString(),
    };
  });
}

/** Tax paid on purchases: lines of supplier bills that are open, part paid or paid, and approved expenses. */
export async function loadInputTax(
  companyId: string,
  from: string,
  to: string,
): Promise<InputTaxLine[]> {
  const admin = getAdminSupabase();
  const out: InputTaxLine[] = [];
  const bills = await admin
    .from('supplier_bills')
    .select('id, supplier_bill_lines(line_total, tax_rate, deleted_at)')
    .eq('company_id', companyId)
    .in('status', ['open', 'partial', 'paid'])
    .gte('bill_date', from)
    .lte('bill_date', to)
    .is('deleted_at', null)
    .limit(10_000);
  if (bills.error) throw new InternalError(bills.error);
  for (const b of bills.data ?? []) {
    const lines =
      (
        b as unknown as {
          supplier_bill_lines:
            | {
                line_total: string | number;
                tax_rate: string | number;
                deleted_at: string | null;
              }[]
            | null;
        }
      ).supplier_bill_lines ?? [];
    for (const l of lines) {
      if (l.deleted_at) continue;
      const base = Money.parseRounded(String(l.line_total));
      const rate = Money.parseRounded(String(l.tax_rate));
      if (rate.isZero()) continue;
      out.push({
        source: 'supplier_bill',
        rate: rate.toDbString(),
        base: base.toDbString(),
        tax: base.mul(rate.toDbString()).div('100').toDbString(),
      });
    }
  }
  const expenses = await admin
    .from('expenses')
    .select('amount_net, tax_amount')
    .eq('company_id', companyId)
    .eq('status', 'approved')
    .gte('expense_date', from)
    .lte('expense_date', to)
    .gt('tax_amount', 0)
    .is('deleted_at', null)
    .limit(20_000);
  if (expenses.error) throw new InternalError(expenses.error);
  for (const e of expenses.data ?? []) {
    const net = Money.parseRounded(String(e.amount_net));
    const tax = Money.parseRounded(String(e.tax_amount));
    if (!net.isPositive()) continue;
    const { integer, fraction } = tax.mul('100').div(net.toDbString()).toParts(2);
    out.push({
      source: 'expense',
      rate: `${integer}.${fraction}`,
      base: net.toDbString(),
      tax: tax.toDbString(),
    });
  }
  return out;
}
