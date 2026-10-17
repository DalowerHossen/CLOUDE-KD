// path: services/invoice/form-data.ts
// What the invoice form needs next to the invoice: tax rates, the starting calculation settings, usable exchange
// rates and the company's invoice defaults (terms, notes, paper).
import 'server-only';
import { defaultInput, termsFromDays, type FormDefaults } from '@/lib/invoice/form';
import type { InvoiceInput } from '@/lib/invoice/input';
import { getSection } from '@/services/company/settings';
import { latestRates } from '@/services/fx/rates';
import { listRates, type TaxRateView } from '@/services/tax/rates';
import { getTaxSettings } from '@/services/tax/settings';

export interface FormData {
  rates: TaxRateView[];
  fxRates: { currency: string; rate: string }[];
  defaultTaxCodes: string[];
  /** The input a brand-new invoice starts with. */
  blank: InvoiceInput;
}

export async function loadFormData(companyId: string, today: string): Promise<FormData> {
  const [rates, tax, fx, invoiceSection] = await Promise.all([
    listRates(companyId),
    getTaxSettings(companyId),
    latestRates(companyId),
    getSection(companyId, 'invoice'),
  ]);
  const active = new Set(rates.filter((r) => r.isActive).map((r) => r.code));
  const defaultTaxCodes = tax.defaultTaxCodes.filter((c) => active.has(c));
  const defaults: FormDefaults = {
    options: {
      priceMode: tax.priceMode,
      discountOrder: tax.discountOrder,
      roundingPolicy: tax.roundingPolicy,
      roundingMode: tax.roundingMode,
      precision: tax.precision,
      cashRounding: tax.cashRounding,
      withholdingRate: tax.defaultWithholding,
    },
    defaultTaxCodes,
    paymentTerms: termsFromDays(invoiceSection.value.dueDays),
    paperSize: 'letter',
  };
  const blank = defaultInput(defaults, today);
  return {
    rates,
    fxRates: fx.map((f) => ({ currency: f.currency, rate: f.rate })),
    defaultTaxCodes,
    blank: { ...blank, notes: invoiceSection.value.notes },
  };
}
