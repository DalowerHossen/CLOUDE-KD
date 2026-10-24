// path: services/taxfiling/reports.ts
// Tax reports as flat tables that the report file builder exports as CSV, Excel and PDF: sales tax by jurisdiction, the VAT or GST
// return, withholding by payee, the quarterly tax provision, tax paid against tax due, and the filing file of one jurisdiction.
import 'server-only';
import { ValidationError } from '@/lib/errors';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { dayText } from '@/services/accounting/journal-rules';
import { metas, monthly } from '@/services/accounting/reports';
import { monthlyTrend, monthsBetween } from '@/services/accounting/report-rules';
import { monthEnd, monthStart } from '@/services/asset/depreciation-rules';
import { buildReportFile, type ExportFormat, type ReportFile } from '@/services/report/export';
import { getFilingSettings, listPayments } from './filing';
import { loadInputTax, loadInvoiceTax, loadRates } from './tax-data';
import {
  jurisdictionOf,
  paidVsDue,
  provision,
  quarterOf,
  salesTaxLines,
  vatReturn,
  withholdingByPayee,
  type InvoiceTax,
  type RateInfo,
} from './tax-rules';

export const TAX_REPORT_KEYS = [
  'sales_tax',
  'vat_return',
  'withholding',
  'provision',
  'paid_vs_due',
  'filing',
] as const;
export type TaxReportKey = (typeof TAX_REPORT_KEYS)[number];

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});
const SALES_KINDS = ['sales', 'vat', 'gst', 'other'] as const;

function table(
  key: string,
  title: string,
  from: string,
  to: string,
  columns: ReportColumn[],
  rows: Record<string, string>[],
  totals: Record<string, string> | null,
  notes: string[] = [],
): ReportResult {
  return { key, title, period: { from, to }, columns, rows, totals, notes };
}

const taxColumns = [
  col('jurisdiction', 'Jurisdiction'),
  col('code', 'Tax'),
  col('name', 'Name'),
  col('rate', 'Rate', 'percent'),
  col('invoices', 'Invoices', 'number'),
  col('base', 'Taxable amount', 'money'),
  col('tax', 'Tax', 'money'),
];

function salesTable(
  key: string,
  title: string,
  from: string,
  to: string,
  invoices: readonly InvoiceTax[],
  rates: ReadonlyMap<string, RateInfo>,
  jurisdiction: string | null,
): ReportResult {
  const all = salesTaxLines(invoices, rates, SALES_KINDS);
  const lines = jurisdiction ? all.filter((l) => l.jurisdiction === jurisdiction) : all;
  return table(
    key,
    title,
    from,
    to,
    taxColumns,
    lines.map((l) => ({
      jurisdiction: l.jurisdiction,
      code: l.code,
      name: l.name,
      rate: l.rate,
      invoices: String(l.invoices),
      base: l.base,
      tax: l.tax,
    })),
    {
      jurisdiction: 'Total',
      base: Money.sum(lines.map((l) => Money.parse(l.base))).toDbString(),
      tax: Money.sum(lines.map((l) => Money.parse(l.tax))).toDbString(),
    },
    [
      'Tax is read from the tax breakdown each invoice keeps, by invoice date. Draft, voided and rejected invoices are left out.',
      ...(lines.some((l) => l.jurisdiction === 'Unspecified')
        ? [
            'Some tax codes have no country in the tax rate settings, so their jurisdiction is Unspecified.',
          ]
        : []),
    ],
  );
}

export async function taxReport(
  actor: Actor,
  key: TaxReportKey,
  from: string,
  to: string,
  jurisdiction: string | null = null,
): Promise<ReportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (!dayText.safeParse(from).success || !dayText.safeParse(to).success || from > to)
    throw new ValidationError('Check the dates.');
  const rates = await loadRates(companyId);
  switch (key) {
    case 'sales_tax':
      return salesTable(
        'tax_sales',
        'Sales tax by jurisdiction',
        from,
        to,
        await loadInvoiceTax(companyId, from, to),
        rates,
        jurisdiction,
      );
    case 'filing': {
      if (!jurisdiction) throw new ValidationError('Choose a jurisdiction.');
      const invoices = await loadInvoiceTax(companyId, from, to);
      const t = salesTable(
        'tax_filing',
        `Tax filing data: ${jurisdiction}`,
        from,
        to,
        invoices,
        rates,
        jurisdiction,
      );
      t.notes.push(
        'This is the data for the filing in a plain format. It is not a form of any tax authority.',
      );
      return t;
    }
    case 'vat_return': {
      const invoices = await loadInvoiceTax(companyId, from, to);
      const r = vatReturn(
        salesTaxLines(invoices, rates, ['vat', 'gst']),
        await loadInputTax(companyId, from, to),
      );
      const rows: Record<string, string>[] = [
        ...r.output.map((l) => ({
          part: 'Output tax',
          detail: `${l.jurisdiction} ${l.code}`,
          rate: l.rate,
          base: l.base,
          tax: l.tax,
        })),
        ...r.input.map((l) => ({
          part: 'Input tax',
          detail: 'Supplier bills and expenses',
          rate: l.rate,
          base: l.base,
          tax: l.tax,
        })),
      ];
      return table(
        'tax_vat_return',
        'VAT and GST return',
        from,
        to,
        [
          col('part', 'Part'),
          col('detail', 'Detail'),
          col('rate', 'Rate', 'percent'),
          col('base', 'Taxable amount', 'money'),
          col('tax', 'Tax', 'money'),
        ],
        rows,
        { part: 'Net payable (output less input)', base: '', tax: r.netPayable },
        [
          `Output tax ${r.outputTax}; input tax ${r.inputTax}. A negative net payable is a refund due.`,
          'Output tax covers tax codes of kind VAT or GST. Input tax is the tax on supplier bills and approved expenses and is not split by jurisdiction.',
        ],
      );
    }
    case 'withholding': {
      const rows = withholdingByPayee(await loadInvoiceTax(companyId, from, to));
      return table(
        'tax_withholding',
        'Withholding tax by payee',
        from,
        to,
        [
          col('payee', 'Payee (client)'),
          col('invoices', 'Invoices', 'number'),
          col('gross', 'Invoiced', 'money'),
          col('rate', 'Rate', 'percent'),
          col('withheld', 'Withheld', 'money'),
        ],
        rows.map((r) => ({
          payee: r.payee,
          invoices: String(r.invoices),
          gross: r.gross,
          rate: r.rate,
          withheld: r.withheld,
        })),
        {
          payee: 'Total',
          withheld: Money.sum(rows.map((r) => Money.parse(r.withheld))).toDbString(),
        },
        ['Tax your clients withheld from what they owed you, as recorded on the invoices.'],
      );
    }
    case 'provision': {
      const settings = await getFilingSettings(companyId);
      const start = `${from.slice(0, 4)}-01-01`;
      const [accounts, byMonth] = await Promise.all([
        metas(companyId),
        monthly(companyId, start, monthEnd(monthStart(to))),
      ]);
      const months = monthlyTrend(
        accounts,
        monthsBetween(start.slice(0, 7), to.slice(0, 7)),
        byMonth,
      );
      const quarters = new Map<string, Money>();
      for (const m of months) {
        const q = `${m.month.slice(0, 4)} Q${quarterOf(`${m.month}-01`)}`;
        quarters.set(q, (quarters.get(q) ?? Money.zero()).add(m.netIncome));
      }
      const rows = provision(
        [...quarters].map(([quarter, v]) => ({ quarter, preTaxIncome: v.toDbString() })),
        settings.provisionRate,
      );
      return table(
        'tax_provision',
        'Quarterly tax provision',
        start,
        to,
        [
          col('quarter', 'Quarter'),
          col('preTaxIncome', 'Profit before tax', 'money'),
          col('provision', 'Provision', 'money'),
          col('cumulative', 'Cumulative', 'money'),
        ],
        rows.map((r) => ({ ...r })),
        { quarter: 'Total', provision: rows[rows.length - 1]?.cumulative ?? '0.0000' },
        [
          `Rate ${settings.provisionRate} percent, set in the tax settings. A loss gives no provision and is not carried forward. This is an estimate, not a tax return.`,
        ],
      );
    }
    case 'paid_vs_due': {
      const invoices = await loadInvoiceTax(companyId, from, to);
      const due = salesTaxLines(invoices, rates, SALES_KINDS).map((l) => ({
        jurisdiction: l.jurisdiction,
        amount: l.tax,
      }));
      const payments = (await listPayments(companyId, from, to)).map((p) => ({
        jurisdiction: p.jurisdiction,
        amount: p.amount,
      }));
      const rows = paidVsDue(due, payments);
      return table(
        'tax_paid_vs_due',
        'Tax paid against tax due',
        from,
        to,
        [
          col('jurisdiction', 'Jurisdiction'),
          col('due', 'Tax charged', 'money'),
          col('paid', 'Paid', 'money'),
          col('balance', 'Still owed', 'money'),
        ],
        rows.map((r) => ({ ...r })),
        {
          jurisdiction: 'Total',
          due: Money.sum(rows.map((r) => Money.parse(r.due))).toDbString(),
          paid: Money.sum(rows.map((r) => Money.parse(r.paid))).toDbString(),
          balance: Money.sum(rows.map((r) => Money.parse(r.balance))).toDbString(),
        },
        [
          'Tax charged is before any credit for tax paid on purchases. Payments are the ones recorded under tax payments, by payment date.',
        ],
      );
    }
  }
}

export async function exportTaxReport(
  actor: Actor,
  key: TaxReportKey,
  from: string,
  to: string,
  jurisdiction: string | null,
  format: ExportFormat,
): Promise<ReportFile> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  return buildReportFile(
    companyId,
    await taxReport(actor, key, from, to, jurisdiction),
    format,
    actor.email || actor.userId,
  );
}

/** The jurisdictions that appear in the tax rates, for the filing export. */
export async function jurisdictionsOf(companyId: string): Promise<string[]> {
  const rates = await loadRates(companyId);
  const out = new Set<string>();
  for (const r of rates.values()) out.add(jurisdictionOf(r));
  return [...out].sort();
}
