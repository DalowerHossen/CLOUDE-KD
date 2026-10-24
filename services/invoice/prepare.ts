// path: services/invoice/prepare.ts
// Turns the input of an invoice form into a worked-out invoice: tax codes become frozen tax rates, exemptions and the
// EU reverse charge are applied, the exchange rate is frozen, and the totals are worked out again on the server.
import 'server-only';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  calculate,
  type CalcLineInput,
  type CalcOptions,
  type CalcResult,
  type TaxRef,
} from '@/lib/invoice/calc';
import type { InvoiceInput } from '@/lib/invoice/input';
import { certificateExpired, reverseChargeApplies } from '@/lib/tax/rules';
import { rateOn } from '@/services/fx/rates';
import { getExemption } from '@/services/tax/exemptions';
import { listRates } from '@/services/tax/rates';
import { getTaxSettings } from '@/services/tax/settings';

export interface Prepared {
  options: CalcOptions;
  calcLines: CalcLineInput[];
  result: CalcResult;
  taxExempt: boolean;
  reverseCharge: boolean;
  shippingTaxes: TaxRef[];
  fx: { rate: string; asOf: string } | null;
}

export async function prepareInvoice(companyId: string, input: InvoiceInput): Promise<Prepared> {
  const [settings, rates] = await Promise.all([getTaxSettings(companyId), listRates(companyId)]);
  const byCode = new Map<string, TaxRef>(
    rates.map((r) => [r.code, { code: r.code, name: r.name, rate: r.rate, compound: r.compound }]),
  );
  const resolve = (codes: readonly string[]): TaxRef[] =>
    codes.map((code) => {
      const ref = byCode.get(code);
      if (!ref) throw new ValidationError(`The tax rate "${code}" does not exist.`);
      return ref;
    });

  // Exemption of the client and the EU reverse charge remove tax from every line.
  let taxExempt = false;
  let clientTaxId = input.billTo.taxId;
  if (input.clientId) {
    const exemption = await getExemption(companyId, input.clientId).catch((error: unknown) => {
      if (error instanceof NotFoundError) throw error;
      return null;
    });
    if (exemption) {
      const today = new Date().toISOString().slice(0, 10);
      taxExempt = exemption.taxExempt && !certificateExpired(exemption.certificateExpiresOn, today);
      if (!clientTaxId) clientTaxId = exemption.clientTaxId;
    }
  }
  const reverseCharge =
    !taxExempt &&
    reverseChargeApplies({
      enabled: settings.reverseCharge,
      sellerCountry: settings.sellerCountry,
      clientCountry: input.billTo.country,
      clientTaxId,
    });
  const removeTax = taxExempt || reverseCharge;

  const calcLines: CalcLineInput[] = input.lines.map((l) => ({
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountKind: l.discountKind,
    discountValue: l.discountValue,
    taxExempt: l.taxExempt || removeTax,
    taxes: resolve(l.taxCodes),
  }));
  const shippingTaxes = resolve(input.options.shippingTaxCodes);
  const options: CalcOptions = {
    priceMode: input.options.priceMode,
    discountOrder: input.options.discountOrder,
    roundingPolicy: input.options.roundingPolicy,
    roundingMode: input.options.roundingMode,
    precision: input.options.precision,
    documentDiscountKind: input.options.documentDiscountKind,
    documentDiscountValue: input.options.documentDiscountValue,
    shippingAmount: input.options.shippingAmount,
    shippingTaxable: input.options.shippingTaxable && !removeTax,
    shippingTaxes,
    withholdingRate: input.options.withholdingRate,
    cashRounding: input.options.cashRounding,
  };
  let result: CalcResult;
  try {
    result = calculate(calcLines, options);
  } catch (error) {
    if (error instanceof RangeError)
      throw new ValidationError('An amount is too large or not valid.');
    throw error;
  }

  let fx: Prepared['fx'] = null;
  if (input.displayCurrency) {
    const rate = await rateOn(
      companyId,
      input.displayCurrency,
      new Date(`${input.issueDate}T12:00:00Z`),
    );
    if (!rate)
      throw new ValidationError(
        `There is no exchange rate for ${input.displayCurrency}. Add one under Tax and rates.`,
      );
    fx = { rate: rate.rate, asOf: rate.asOf };
  }
  return { options, calcLines, result, taxExempt, reverseCharge, shippingTaxes, fx };
}
