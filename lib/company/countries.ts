// path: lib/company/countries.ts
// Country codes offered in forms (ISO 3166-1 alpha-2). Names come from Intl.DisplayNames in the browser or server.
export const COUNTRY_CODES = [
  'AE',
  'AU',
  'BD',
  'BH',
  'BN',
  'BR',
  'CA',
  'CH',
  'CN',
  'DE',
  'EG',
  'ES',
  'FR',
  'GB',
  'HK',
  'ID',
  'IE',
  'IN',
  'IT',
  'JP',
  'KH',
  'KR',
  'KW',
  'LK',
  'MM',
  'MN',
  'MO',
  'MV',
  'MX',
  'MY',
  'NG',
  'NL',
  'NP',
  'NZ',
  'OM',
  'PH',
  'PK',
  'PL',
  'QA',
  'SA',
  'SE',
  'SG',
  'TH',
  'TR',
  'TW',
  'US',
  'VN',
  'ZA',
] as const;

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
