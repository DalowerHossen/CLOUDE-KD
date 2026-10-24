// path: lib/tax/rules.ts
// Pure tax rules that do not need the database.

export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;

const EU = new Set<string>(EU_COUNTRIES);

/**
 * EU reverse charge: a business sells to a business in another EU country, the client has a tax number, and the
 * company has switched the rule on. The invoice then carries no tax and a reverse-charge note.
 */
export function reverseChargeApplies(input: {
  enabled: boolean;
  sellerCountry: string | null;
  clientCountry: string | null;
  clientTaxId: string;
}): boolean {
  const { enabled, sellerCountry, clientCountry, clientTaxId } = input;
  if (!enabled || !sellerCountry || !clientCountry) return false;
  if (clientTaxId.trim() === '') return false;
  return EU.has(sellerCountry) && EU.has(clientCountry) && sellerCountry !== clientCountry;
}

export const REVERSE_CHARGE_NOTE = 'Reverse charge: VAT to be accounted for by the recipient.';

/** True when a tax-exemption certificate has run out on `today` (both YYYY-MM-DD). */
export function certificateExpired(expiresOn: string | null, today: string): boolean {
  return expiresOn !== null && expiresOn < today;
}

/**
 * Hook for checking a VAT number with an official service (for example VIES). A provider registers itself; without
 * one the number is stored as entered and shown as "not checked".
 */
export type TaxIdChecker = (country: string, taxId: string) => Promise<{ valid: boolean } | null>;

let checker: TaxIdChecker | null = null;
export function registerTaxIdChecker(fn: TaxIdChecker): void {
  checker = fn;
}
export function taxIdChecker(): TaxIdChecker | null {
  return checker;
}
