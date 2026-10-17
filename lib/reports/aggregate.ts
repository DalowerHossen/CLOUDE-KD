// path: lib/reports/aggregate.ts
// The sums of the reports, as pure functions over plain rows. The services fetch the rows (always for one company) and
// these functions add them up with Money, so every total can be checked by hand. Safe to import in the browser.
import { daysBetween } from '@/lib/invoice/terms';
import { Money } from '@/lib/utils/currency';
import type { ReportColumn, ReportResult } from './types';

const text = (m: Money): string => m.toDbString();
const hours = (m: Money): string => m.toDbString().slice(0, -2);
const sumOf = (xs: readonly string[]): Money => xs.reduce((s, x) => s.add(x), Money.zero());

export interface InvoiceFact {
  id: string;
  number: string | null;
  clientId: string | null;
  clientName: string;
  kind: string;
  status: string;
  issueDate: string;
  dueDate: string;
  sentAt: string | null;
  total: string;
  taxTotal: string;
  amountDue: string;
  amountPaid: string;
  taxBreakdown: { code: string; name?: string; rate: string; base: string; amount: string }[];
  projectId: string | null;
}

export interface CreditFact {
  id: string;
  number: string | null;
  clientName: string;
  invoiceNumber: string;
  issueDate: string;
  status: string;
  reason: string;
  total: string;
  taxTotal: string;
  appliedAmount: string;
  taxBreakdown: { code: string; rate: string; base: string; amount: string }[];
}

export interface ItemFact {
  sku: string;
  description: string;
  quantity: string;
  net: string;
  tax: string;
  lineTotal: string;
}

export interface PaymentFact {
  id: string;
  invoiceNumber: string;
  clientName: string;
  amount: string;
  at: string;
}

export interface TimeFact {
  projectId: string;
  projectName: string;
  userId: string;
  userName: string;
  hours: string;
  billable: boolean;
  rate: string;
  status: string;
}

export interface EstimateFact {
  status: string;
  total: string;
}

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});
const inRange = (day: string, from: string, to: string): boolean => day >= from && day <= to;

/** Invoices that count as sales: sent, not void, an invoice or debit note, sent inside the range. */
export function isSale(i: InvoiceFact, from: string, to: string): boolean {
  return (
    (i.kind === 'invoice' || i.kind === 'debit_note') &&
    i.status !== 'void' &&
    i.status !== 'draft' &&
    i.status !== 'pending_approval' &&
    i.sentAt !== null &&
    inRange(i.sentAt.slice(0, 10), from, to)
  );
}

export function salesSummary(
  invoices: readonly InvoiceFact[],
  credits: readonly CreditFact[],
  from: string,
  to: string,
): ReportResult {
  const months = new Map<string, { sales: Money; tax: Money; count: number; credits: Money }>();
  const cell = (m: string): { sales: Money; tax: Money; count: number; credits: Money } => {
    const c = months.get(m) ?? {
      sales: Money.zero(),
      tax: Money.zero(),
      count: 0,
      credits: Money.zero(),
    };
    months.set(m, c);
    return c;
  };
  for (const i of invoices.filter((x) => isSale(x, from, to))) {
    const c = cell((i.sentAt as string).slice(0, 7));
    c.sales = c.sales.add(i.total);
    c.tax = c.tax.add(i.taxTotal);
    c.count += 1;
  }
  for (const n of credits.filter((x) => x.status === 'issued' && inRange(x.issueDate, from, to)))
    cell(n.issueDate.slice(0, 7)).credits = cell(n.issueDate.slice(0, 7)).credits.add(n.total);
  const keys = [...months.keys()].sort();
  const rows = keys.map((k) => {
    const c = months.get(k) as { sales: Money; tax: Money; count: number; credits: Money };
    return {
      month: k,
      count: String(c.count),
      sales: text(c.sales),
      tax: text(c.tax),
      credits: text(c.credits),
      net: text(c.sales.sub(c.credits)),
    };
  });
  const total = (f: string): Money => sumOf(rows.map((r) => r[f as keyof typeof r]));
  return {
    key: 'sales_summary',
    title: 'Sales summary',
    period: { from, to },
    columns: [
      col('month', 'Month'),
      col('count', 'Invoices', 'number'),
      col('sales', 'Invoiced', 'money'),
      col('tax', 'Tax included', 'money'),
      col('credits', 'Credit notes', 'money'),
      col('net', 'Net sales', 'money'),
    ],
    rows,
    totals: {
      month: 'Total',
      count: String(rows.reduce((s, r) => s + Number(r.count), 0)),
      sales: text(total('sales')),
      tax: text(total('tax')),
      credits: text(total('credits')),
      net: text(total('net')),
    },
    notes: [
      'Invoiced is the invoice total when it was sent. Credit notes are shown on the month they were issued.',
    ],
  };
}

export function revenueByClient(
  invoices: readonly InvoiceFact[],
  payments: readonly PaymentFact[],
  from: string,
  to: string,
): ReportResult {
  const map = new Map<
    string,
    { name: string; count: number; invoiced: Money; collected: Money; open: Money }
  >();
  const get = (
    id: string,
    name: string,
  ): { name: string; count: number; invoiced: Money; collected: Money; open: Money } => {
    const c = map.get(id) ?? {
      name,
      count: 0,
      invoiced: Money.zero(),
      collected: Money.zero(),
      open: Money.zero(),
    };
    map.set(id, c);
    return c;
  };
  const keyOf = (i: { clientId: string | null; clientName: string }): string =>
    i.clientId ?? `walk-in:${i.clientName}`;
  for (const i of invoices.filter((x) => isSale(x, from, to))) {
    const c = get(keyOf(i), i.clientName);
    c.count += 1;
    c.invoiced = c.invoiced.add(i.total);
    c.open = c.open.add(Money.parse(i.amountDue).sub(i.amountPaid));
  }
  const byInvoiceNumber = new Map(invoices.map((i) => [i.number ?? '', i]));
  for (const p of payments.filter((x) => inRange(x.at.slice(0, 10), from, to))) {
    const inv = byInvoiceNumber.get(p.invoiceNumber);
    const c = get(inv ? keyOf(inv) : `walk-in:${p.clientName}`, p.clientName);
    c.collected = c.collected.add(p.amount);
  }
  const rows = [...map.values()]
    .sort((a, b) =>
      b.invoiced.gt(a.invoiced) ? 1 : b.invoiced.eq(a.invoiced) ? a.name.localeCompare(b.name) : -1,
    )
    .map((c) => ({
      client: c.name,
      count: String(c.count),
      invoiced: text(c.invoiced),
      collected: text(c.collected),
      open: text(c.open),
    }));
  return {
    key: 'revenue_by_client',
    title: 'Revenue by client',
    period: { from, to },
    columns: [
      col('client', 'Client'),
      col('count', 'Invoices', 'number'),
      col('invoiced', 'Invoiced', 'money'),
      col('collected', 'Collected', 'money'),
      col('open', 'Still unpaid', 'money'),
    ],
    rows,
    totals: {
      client: 'Total',
      count: String(rows.reduce((s, r) => s + Number(r.count), 0)),
      invoiced: text(sumOf(rows.map((r) => r.invoiced))),
      collected: text(sumOf(rows.map((r) => r.collected))),
      open: text(sumOf(rows.map((r) => r.open))),
    },
    notes: [
      'Collected is cash received in the period, whichever invoice date it belongs to. Credits and write-offs are not cash.',
    ],
  };
}

export function revenueByItem(items: readonly ItemFact[], from: string, to: string): ReportResult {
  const map = new Map<
    string,
    { sku: string; description: string; qty: Money; net: Money; tax: Money; total: Money }
  >();
  for (const it of items) {
    const key = `${it.sku}|${it.description.toLowerCase()}`;
    const c = map.get(key) ?? {
      sku: it.sku,
      description: it.description,
      qty: Money.zero(),
      net: Money.zero(),
      tax: Money.zero(),
      total: Money.zero(),
    };
    c.qty = c.qty.add(it.quantity);
    c.net = c.net.add(it.net);
    c.tax = c.tax.add(it.tax);
    c.total = c.total.add(it.lineTotal);
    map.set(key, c);
  }
  const rows = [...map.values()]
    .sort((a, b) =>
      b.net.gt(a.net) ? 1 : b.net.eq(a.net) ? a.description.localeCompare(b.description) : -1,
    )
    .map((c) => ({
      sku: c.sku,
      description: c.description,
      quantity: hours(c.qty),
      net: text(c.net),
      tax: text(c.tax),
      total: text(c.total),
    }));
  return {
    key: 'revenue_by_item',
    title: 'Revenue by item',
    period: { from, to },
    columns: [
      col('sku', 'SKU'),
      col('description', 'Item'),
      col('quantity', 'Quantity', 'number'),
      col('net', 'Net sales', 'money'),
      col('tax', 'Tax', 'money'),
      col('total', 'Total', 'money'),
    ],
    rows,
    totals: {
      sku: 'Total',
      description: '',
      quantity: hours(sumOf(rows.map((r) => r.quantity))),
      net: text(sumOf(rows.map((r) => r.net))),
      tax: text(sumOf(rows.map((r) => r.tax))),
      total: text(sumOf(rows.map((r) => r.total))),
    },
    notes: [
      'Items with the same SKU and name are added together. Document discounts are already shared out over the lines.',
    ],
  };
}

export const AGING_BUCKETS = [
  { key: 'current', label: 'Not due' },
  { key: 'd1_30', label: '1-30 days late' },
  { key: 'd31_60', label: '31-60 days late' },
  { key: 'd61_90', label: '61-90 days late' },
  { key: 'd90_plus', label: 'Over 90 days late' },
] as const;

export function agingBucket(dueDate: string, today: string): (typeof AGING_BUCKETS)[number]['key'] {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return 'current';
  if (late <= 30) return 'd1_30';
  if (late <= 60) return 'd31_60';
  if (late <= 90) return 'd61_90';
  return 'd90_plus';
}

const OPEN = new Set(['sent', 'viewed', 'partially_paid', 'overdue', 'disputed']);

export function receivablesAging(invoices: readonly InvoiceFact[], today: string): ReportResult {
  const rows = invoices
    .filter((i) => OPEN.has(i.status) && i.kind !== 'proforma')
    .map((i) => {
      const balance = Money.parse(i.amountDue).sub(i.amountPaid);
      const bucket = agingBucket(i.dueDate, today);
      const row: Record<string, string> = {
        client: i.clientName,
        number: i.number ?? '',
        dueDate: i.dueDate,
        daysLate: String(Math.max(0, daysBetween(i.dueDate, today))),
        balance: text(balance),
      };
      for (const b of AGING_BUCKETS) row[b.key] = b.key === bucket ? text(balance) : '0.0000';
      return row;
    })
    .filter((r) => Money.parse(r.balance as string).isPositive())
    .sort(
      (a, b) =>
        (a.client as string).localeCompare(b.client as string) ||
        (a.dueDate as string).localeCompare(b.dueDate as string),
    );
  const totals: Record<string, string> = {
    client: 'Total',
    number: '',
    dueDate: '',
    daysLate: '',
    balance: text(sumOf(rows.map((r) => r.balance as string))),
  };
  for (const b of AGING_BUCKETS) totals[b.key] = text(sumOf(rows.map((r) => r[b.key] as string)));
  return {
    key: 'ar_aging',
    title: 'Unpaid invoices by age',
    period: null,
    columns: [
      col('client', 'Client'),
      col('number', 'Invoice'),
      col('dueDate', 'Due', 'date'),
      col('daysLate', 'Days late', 'number'),
      col('balance', 'Unpaid', 'money'),
      ...AGING_BUCKETS.map((b) => col(b.key, b.label, 'money')),
    ],
    rows,
    totals,
    notes: [`Age is counted from the due date to ${today}.`],
  };
}

export function statusSummary(
  invoices: readonly InvoiceFact[],
  from: string,
  to: string,
): ReportResult {
  const map = new Map<string, { count: number; total: Money; due: Money }>();
  for (const i of invoices.filter(
    (x) => (x.kind === 'invoice' || x.kind === 'debit_note') && inRange(x.issueDate, from, to),
  )) {
    const c = map.get(i.status) ?? { count: 0, total: Money.zero(), due: Money.zero() };
    c.count += 1;
    c.total = c.total.add(i.total);
    c.due = c.due.add(
      i.status === 'void' ? Money.zero() : Money.parse(i.amountDue).sub(i.amountPaid),
    );
    map.set(i.status, c);
  }
  const rows = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, c]) => ({
      status,
      count: String(c.count),
      total: text(c.total),
      unpaid: text(c.due),
    }));
  return {
    key: 'invoice_status',
    title: 'Invoices by status',
    period: { from, to },
    columns: [
      col('status', 'Status'),
      col('count', 'Invoices', 'number'),
      col('total', 'Total', 'money'),
      col('unpaid', 'Still unpaid', 'money'),
    ],
    rows,
    totals: {
      status: 'Total',
      count: String(rows.reduce((s, r) => s + Number(r.count), 0)),
      total: text(sumOf(rows.map((r) => r.total))),
      unpaid: text(sumOf(rows.map((r) => r.unpaid))),
    },
    notes: ['Invoices are grouped by their issue date.'],
  };
}

export function taxSummary(
  invoices: readonly InvoiceFact[],
  credits: readonly CreditFact[],
  from: string,
  to: string,
): ReportResult {
  const map = new Map<
    string,
    { code: string; rate: string; base: Money; tax: Money; cbase: Money; ctax: Money }
  >();
  const cell = (
    code: string,
    rate: string,
  ): { code: string; rate: string; base: Money; tax: Money; cbase: Money; ctax: Money } => {
    const key = `${code}|${rate}`;
    const c = map.get(key) ?? {
      code,
      rate,
      base: Money.zero(),
      tax: Money.zero(),
      cbase: Money.zero(),
      ctax: Money.zero(),
    };
    map.set(key, c);
    return c;
  };
  for (const i of invoices.filter((x) => isSale(x, from, to)))
    for (const t of i.taxBreakdown) {
      const c = cell(t.code, t.rate);
      c.base = c.base.add(t.base);
      c.tax = c.tax.add(t.amount);
    }
  for (const n of credits.filter((x) => x.status === 'issued' && inRange(x.issueDate, from, to)))
    for (const t of n.taxBreakdown) {
      const c = cell(t.code, t.rate);
      c.cbase = c.cbase.add(t.base);
      c.ctax = c.ctax.add(t.amount);
    }
  const rows = [...map.values()]
    .sort((a, b) => a.code.localeCompare(b.code) || a.rate.localeCompare(b.rate))
    .map((c) => ({
      code: c.code,
      rate: Money.parse(c.rate).toDbString().replace(/0+$/, '').replace(/\.$/, ''),
      base: text(c.base),
      tax: text(c.tax),
      creditTax: text(c.ctax),
      net: text(c.tax.sub(c.ctax)),
    }));
  return {
    key: 'tax_summary',
    title: 'Tax summary',
    period: { from, to },
    columns: [
      col('code', 'Tax'),
      col('rate', 'Rate %', 'number'),
      col('base', 'Taxable sales', 'money'),
      col('tax', 'Tax charged', 'money'),
      col('creditTax', 'Tax credited', 'money'),
      col('net', 'Net tax due', 'money'),
    ],
    rows,
    totals: {
      code: 'Total',
      rate: '',
      base: text(sumOf(rows.map((r) => r.base))),
      tax: text(sumOf(rows.map((r) => r.tax))),
      creditTax: text(sumOf(rows.map((r) => r.creditTax))),
      net: text(sumOf(rows.map((r) => r.net))),
    },
    notes: [
      'Tax is taken from the sent invoices and the issued credit notes of the period. Tax withheld by clients is not included.',
    ],
  };
}

export function paymentsReceived(
  payments: readonly PaymentFact[],
  from: string,
  to: string,
): ReportResult {
  const rows = payments
    .filter((p) => inRange(p.at.slice(0, 10), from, to))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((p) => ({
      date: p.at.slice(0, 10),
      client: p.clientName,
      invoice: p.invoiceNumber,
      amount: text(Money.parse(p.amount)),
    }));
  return {
    key: 'payments_received',
    title: 'Payments received',
    period: { from, to },
    columns: [
      col('date', 'Date', 'date'),
      col('client', 'Client'),
      col('invoice', 'Invoice'),
      col('amount', 'Amount', 'money'),
    ],
    rows,
    totals: {
      date: 'Total',
      client: '',
      invoice: '',
      amount: text(sumOf(rows.map((r) => r.amount))),
    },
    notes: [
      'Cash only. Credit notes, deposits used as payment and write-offs are not listed here.',
    ],
  };
}

export function creditsReport(
  credits: readonly CreditFact[],
  from: string,
  to: string,
): ReportResult {
  const rows = credits
    .filter((c) => inRange(c.issueDate, from, to))
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    .map((c) => ({
      date: c.issueDate,
      number: c.number ?? '',
      client: c.clientName,
      invoice: c.invoiceNumber,
      reason: c.reason,
      status: c.status,
      total: text(Money.parse(c.total)),
      applied: text(Money.parse(c.appliedAmount)),
    }));
  const live = rows.filter((r) => r.status === 'issued');
  return {
    key: 'credit_notes',
    title: 'Credit notes',
    period: { from, to },
    columns: [
      col('date', 'Date', 'date'),
      col('number', 'Credit note'),
      col('client', 'Client'),
      col('invoice', 'Invoice'),
      col('reason', 'Reason'),
      col('status', 'Status'),
      col('total', 'Total', 'money'),
      col('applied', 'Applied', 'money'),
    ],
    rows,
    totals: {
      date: 'Total',
      number: '',
      client: '',
      invoice: '',
      reason: '',
      status: '',
      total: text(sumOf(live.map((r) => r.total))),
      applied: text(sumOf(live.map((r) => r.applied))),
    },
    notes: ['Totals count issued credit notes only.'],
  };
}

export function timeSummary(
  entries: readonly TimeFact[],
  groupBy: 'project' | 'person',
  from: string,
  to: string,
): ReportResult {
  const map = new Map<
    string,
    { name: string; total: Money; billable: Money; value: Money; waiting: Money }
  >();
  for (const e of entries) {
    if (e.status === 'rejected') continue;
    const key = groupBy === 'project' ? e.projectId : e.userId;
    const c = map.get(key) ?? {
      name: groupBy === 'project' ? e.projectName : e.userName,
      total: Money.zero(),
      billable: Money.zero(),
      value: Money.zero(),
      waiting: Money.zero(),
    };
    c.total = c.total.add(e.hours);
    if (e.billable) {
      c.billable = c.billable.add(e.hours);
      c.value = c.value.add(Money.parse(e.rate).mul(e.hours));
      if (e.status === 'approved') c.waiting = c.waiting.add(Money.parse(e.rate).mul(e.hours));
    }
    map.set(key, c);
  }
  const rows = [...map.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      hours: hours(c.total),
      billable: hours(c.billable),
      share: c.total.isZero()
        ? '0.00'
        : c.billable.mul('100').div(c.total.toDbString()).toDbString().slice(0, -2),
      value: text(c.value),
      unbilled: text(c.waiting),
    }));
  const totalHours = sumOf(rows.map((r) => r.hours));
  const billableHours = sumOf(rows.map((r) => r.billable));
  return {
    key: 'time_summary',
    title: groupBy === 'project' ? 'Time by project' : 'Time by person',
    period: { from, to },
    columns: [
      col('name', groupBy === 'project' ? 'Project' : 'Person'),
      col('hours', 'Hours', 'number'),
      col('billable', 'Billable hours', 'number'),
      col('share', 'Billable %', 'percent'),
      col('value', 'Value of billable time', 'money'),
      col('unbilled', 'Approved, not billed', 'money'),
    ],
    rows,
    totals: {
      name: 'Total',
      hours: hours(totalHours),
      billable: hours(billableHours),
      share: totalHours.isZero()
        ? '0.00'
        : billableHours.mul('100').div(totalHours.toDbString()).toDbString().slice(0, -2),
      value: text(sumOf(rows.map((r) => r.value))),
      unbilled: text(sumOf(rows.map((r) => r.unbilled))),
    },
    notes: ['Rejected time is left out. Value is hours times the rate each entry was logged with.'],
  };
}

export function estimatesFunnel(
  estimates: readonly EstimateFact[],
  from: string,
  to: string,
): ReportResult {
  const order = ['draft', 'sent', 'viewed', 'accepted', 'converted', 'declined', 'expired', 'void'];
  const map = new Map<string, { count: number; total: Money }>();
  for (const e of estimates) {
    const c = map.get(e.status) ?? { count: 0, total: Money.zero() };
    c.count += 1;
    c.total = c.total.add(e.total);
    map.set(e.status, c);
  }
  const rows = order
    .filter((s) => map.has(s))
    .map((s) => ({
      status: s,
      count: String((map.get(s) as { count: number }).count),
      total: text((map.get(s) as { total: Money }).total),
    }));
  const sent = estimates.filter((e) => e.status !== 'draft' && e.status !== 'void');
  const won = sent.filter((e) => e.status === 'accepted' || e.status === 'converted');
  const rate =
    sent.length === 0
      ? '0.00'
      : Money.parse(String(won.length))
          .mul('100')
          .div(String(sent.length))
          .toDbString()
          .slice(0, -2);
  return {
    key: 'estimates_funnel',
    title: 'Estimates',
    period: { from, to },
    columns: [
      col('status', 'Status'),
      col('count', 'Estimates', 'number'),
      col('total', 'Total', 'money'),
    ],
    rows,
    totals: {
      status: 'Total',
      count: String(rows.reduce((s, r) => s + Number(r.count), 0)),
      total: text(sumOf(rows.map((r) => r.total))),
    },
    notes: [
      `Win rate: ${rate}% of ${sent.length} estimates that were sent were accepted or turned into invoices.`,
    ],
  };
}
