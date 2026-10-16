// path: lib/tax/templates.ts
// Ready-made tax rates by country that a company can add with one click (the rates are suggestions to check with a
// tax adviser; a company can change every value afterwards). Display and convenience only.
export interface TaxTemplateRate {
  code: string;
  name: string;
  rate: string;
  kind: 'sales' | 'vat' | 'gst' | 'withholding' | 'other';
  compound: boolean;
}
export interface TaxTemplate {
  id: string;
  country: string;
  name: string;
  rates: readonly TaxTemplateRate[];
}

const rate = (
  code: string,
  name: string,
  value: string,
  kind: TaxTemplateRate['kind'],
): TaxTemplateRate => ({ code, name, rate: value, kind, compound: false });

export const TAX_TEMPLATES: readonly TaxTemplate[] = [
  {
    id: 'in-gst',
    country: 'IN',
    name: 'India GST',
    rates: [
      rate('GST5', 'GST 5%', '5', 'gst'),
      rate('GST12', 'GST 12%', '12', 'gst'),
      rate('GST18', 'GST 18%', '18', 'gst'),
      rate('GST28', 'GST 28%', '28', 'gst'),
    ],
  },
  {
    id: 'my-sst',
    country: 'MY',
    name: 'Malaysia SST',
    rates: [
      rate('SST6', 'Service tax 6%', '6', 'sales'),
      rate('SST10', 'Sales tax 10%', '10', 'sales'),
    ],
  },
  {
    id: 'vn-vat',
    country: 'VN',
    name: 'Vietnam VAT',
    rates: [rate('VAT10', 'VAT 10%', '10', 'vat')],
  },
  {
    id: 'sg-gst',
    country: 'SG',
    name: 'Singapore GST',
    rates: [rate('GST9', 'GST 9%', '9', 'gst')],
  },
  {
    id: 'th-vat',
    country: 'TH',
    name: 'Thailand VAT',
    rates: [rate('VAT7', 'VAT 7%', '7', 'vat')],
  },
  {
    id: 'ph-vat',
    country: 'PH',
    name: 'Philippines VAT',
    rates: [rate('VAT12', 'VAT 12%', '12', 'vat')],
  },
  {
    id: 'id-vat',
    country: 'ID',
    name: 'Indonesia VAT',
    rates: [rate('VAT11', 'VAT 11%', '11', 'vat')],
  },
  {
    id: 'jp-ct',
    country: 'JP',
    name: 'Japan consumption tax',
    rates: [
      rate('CT10', 'Consumption tax 10%', '10', 'sales'),
      rate('CT8', 'Reduced rate 8%', '8', 'sales'),
    ],
  },
  {
    id: 'kr-vat',
    country: 'KR',
    name: 'South Korea VAT',
    rates: [rate('VAT10', 'VAT 10%', '10', 'vat')],
  },
  {
    id: 'bd-vat',
    country: 'BD',
    name: 'Bangladesh VAT',
    rates: [rate('VAT15', 'VAT 15%', '15', 'vat')],
  },
  {
    id: 'pk-st',
    country: 'PK',
    name: 'Pakistan sales tax',
    rates: [rate('ST17', 'Sales tax 17%', '17', 'sales')],
  },
  {
    id: 'cn-vat',
    country: 'CN',
    name: 'China VAT',
    rates: [
      rate('VAT13', 'VAT 13%', '13', 'vat'),
      rate('VAT9', 'VAT 9%', '9', 'vat'),
      rate('VAT6', 'VAT 6%', '6', 'vat'),
    ],
  },
  {
    id: 'gb-vat',
    country: 'GB',
    name: 'United Kingdom VAT',
    rates: [rate('VAT20', 'VAT 20%', '20', 'vat'), rate('VAT5', 'Reduced 5%', '5', 'vat')],
  },
  {
    id: 'au-gst',
    country: 'AU',
    name: 'Australia GST',
    rates: [rate('GST10', 'GST 10%', '10', 'gst')],
  },
  {
    id: 'ae-vat',
    country: 'AE',
    name: 'United Arab Emirates VAT',
    rates: [rate('VAT5', 'VAT 5%', '5', 'vat')],
  },
];

export function findTemplate(id: string): TaxTemplate | undefined {
  return TAX_TEMPLATES.find((t) => t.id === id);
}

/** US states and the District of Columbia, for sales-tax nexus and jurisdictions. */
export const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;
