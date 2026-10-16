// path: lib/transfer/targets.ts
// Fields and row rules of the three lists that can be imported. Pure; the database work is in services/import/targets.
import { clientInputSchema, type ClientInput } from '@/lib/crm/clients';
import { productInputSchema, type ProductInput } from '@/lib/catalog/products';
import { supplierInputSchema, type SupplierInput } from '@/lib/procurement/suppliers';
import { parseRow, reads, type Draft, type FieldDef, type Parsed } from './rows';

const f = (
  key: string,
  label: string,
  read: FieldDef['read'],
  aliases: readonly string[] = [],
  required = false,
): FieldDef => ({ key, label, required, aliases, read });

export const CLIENT_FIELDS: readonly FieldDef[] = [
  f('name', 'Name', reads.text('name'), ['client', 'client name', 'company', 'company name'], true),
  f('kind', 'Kind', reads.oneOf(['company', 'person'], 'kind'), ['type']),
  f('contact_name', 'Contact person', reads.text('contactName'), ['contact']),
  f('email', 'E-mail', reads.lower('email'), ['email address']),
  f('billing_email', 'Billing e-mail', reads.lower('billingEmail')),
  f('phone', 'Phone', reads.text('phone'), ['telephone', 'mobile']),
  f('website', 'Website', reads.text('website')),
  f('tax_id', 'Tax number', reads.text('taxId'), ['vat', 'vat number', 'tax id']),
  f('payment_terms_days', 'Payment terms in days', reads.integer(0, 365, 'paymentTermsDays'), [
    'terms',
  ]),
  f('notes', 'Notes', reads.text('notes')),
  f('tags', 'Tags (separated by ;)', reads.list('tags'), ['tags']),
  f('billing_line1', 'Billing address line 1', reads.text('billing', 'line1'), [
    'address',
    'address line 1',
  ]),
  f('billing_line2', 'Billing address line 2', reads.text('billing', 'line2')),
  f('billing_city', 'Billing city', reads.text('billing', 'city'), ['city']),
  f('billing_region', 'Billing state or region', reads.text('billing', 'region'), [
    'state',
    'region',
  ]),
  f(
    'billing_postal_code',
    'Billing postal code',
    reads.text('billing', 'postalCode'),
    ['postal code', 'zip', 'zip code', 'postcode'],
    true,
  ),
  f(
    'billing_country',
    'Billing country code',
    reads.country('billing', 'country'),
    ['country', 'country code'],
    true,
  ),
  f('shipping_line1', 'Shipping address line 1', reads.text('shipping', 'line1')),
  f('shipping_city', 'Shipping city', reads.text('shipping', 'city')),
  f('shipping_postal_code', 'Shipping postal code', reads.text('shipping', 'postalCode')),
  f('shipping_country', 'Shipping country code', reads.country('shipping', 'country')),
  f('opening_balance', 'Opening balance', reads.money('openingBalance')),
  f('credit_limit', 'Credit limit', reads.money('creditLimit')),
  f('risk_flag', 'Risk flag', reads.oneOf(['none', 'watch', 'high'], 'riskFlag')),
  f('do_not_contact', 'Do not contact (yes or no)', reads.bool('doNotContact')),
  f('marketing_consent', 'Marketing consent (yes or no)', reads.bool('marketingConsent')),
];

const CLIENT_DEFAULTS: Draft = {
  kind: 'company',
  name: '',
  contactName: '',
  email: '',
  billingEmail: '',
  phone: '',
  website: '',
  taxId: '',
  displayCurrency: 'USD',
  paymentTermsDays: null,
  notes: '',
  tags: [],
  customFields: {},
  billing: { line1: '', line2: '', city: '', region: '', postalCode: '', country: '' },
  shipping: { line1: '', line2: '', city: '', region: '', postalCode: '', country: null },
  openingBalance: '0',
  creditLimit: null,
  riskFlag: 'none',
  doNotContact: false,
  remindersOptOut: false,
  marketingConsent: false,
  contactPreference: 'email',
  portalPrefs: { notifyByEmail: true, showStatement: true },
  contacts: [],
};

export function parseClientRow(
  row: Record<string, string>,
): ReturnType<typeof parseRow<typeof clientInputSchema>> {
  return parseRow(CLIENT_FIELDS, CLIENT_DEFAULTS, clientInputSchema, row);
}
export type ParsedClient = Parsed<ClientInput>;

export const PRODUCT_FIELDS: readonly FieldDef[] = [
  f(
    'name',
    'Name',
    reads.text('name'),
    ['item', 'item name', 'product', 'product name', 'service'],
    true,
  ),
  f('kind', 'Kind (product or service)', reads.oneOf(['product', 'service'], 'kind'), ['type']),
  f('description', 'Description', reads.text('description')),
  f('sku', 'SKU', reads.text('sku'), ['item code', 'code']),
  f('barcode', 'Barcode', reads.text('barcode'), ['ean', 'upc']),
  f('unit', 'Unit', reads.lower('unit'), ['uom']),
  f(
    'unit_price',
    'Price',
    reads.money('unitPrice'),
    ['unit price', 'selling price', 'sale price'],
    true,
  ),
  f('cost_price', 'Cost', reads.money('costPrice'), ['cost price', 'purchase price']),
  f(
    'tax_category',
    'Tax category',
    reads.oneOf(['standard', 'reduced', 'zero', 'exempt'], 'taxCategory'),
  ),
  f('tax_rate', 'Tax rate (percent)', reads.text('taxRate'), ['tax', 'vat rate']),
  f('category', 'Category', reads.text('categoryName'), ['group']),
  f('hs_code', 'Customs code', reads.text('hsCode'), ['hs code']),
  f('track_inventory', 'Track stock (yes or no)', reads.bool('trackInventory'), [
    'track stock',
    'stocked',
  ]),
  f('valuation_method', 'Cost method', reads.oneOf(['average', 'fifo', 'lifo'], 'valuationMethod')),
  f('status', 'State', reads.oneOf(['active', 'inactive', 'archived'], 'status'), ['status']),
];

const PRODUCT_DEFAULTS: Draft = {
  kind: 'product',
  name: '',
  description: '',
  sku: '',
  barcode: '',
  unit: 'unit',
  unitPrice: '0',
  costPrice: '0',
  taxCategory: 'standard',
  taxRate: '0',
  categoryId: null,
  hsCode: '',
  trackInventory: false,
  valuationMethod: 'average',
  status: 'active',
  customFields: {},
  volumeTiers: [],
  bundleItems: [],
};

export type ParsedProduct = Parsed<ProductInput> & { categoryName: string };

export function parseProductRow(
  row: Record<string, string>,
): { ok: true; value: ParsedProduct } | { ok: false; errors: string[] } {
  const r = parseRow(PRODUCT_FIELDS, PRODUCT_DEFAULTS, productInputSchema, row, (draft) => {
    // A service has no stock, whatever the file says.
    if (draft.kind === 'service' && draft.trackInventory === true) draft.trackInventory = false;
    delete draft.categoryName;
  });
  if (!r.ok) return r;
  const categoryName =
    typeof r.value.patch.categoryName === 'string' ? r.value.patch.categoryName : '';
  return { ok: true, value: { ...r.value, categoryName } };
}

export const SUPPLIER_FIELDS: readonly FieldDef[] = [
  f('name', 'Name', reads.text('name'), ['supplier', 'supplier name', 'vendor', 'company'], true),
  f('contact_name', 'Contact person', reads.text('contactName'), ['contact']),
  f('email', 'E-mail', reads.lower('email'), ['email address']),
  f('phone', 'Phone', reads.text('phone'), ['telephone', 'mobile']),
  f('website', 'Website', reads.text('website')),
  f('tax_id', 'Tax number', reads.text('taxId'), ['vat', 'vat number', 'tax id']),
  f('category', 'Category', reads.text('category')),
  f('payment_terms_days', 'Payment terms in days', reads.integer(0, 365, 'paymentTermsDays'), [
    'terms',
  ]),
  f('address_line1', 'Address line 1', reads.text('addressLine1'), ['address']),
  f('address_line2', 'Address line 2', reads.text('addressLine2')),
  f('address_city', 'City', reads.text('addressCity')),
  f('address_region', 'State or region', reads.text('addressRegion'), ['state', 'region']),
  f('address_postal_code', 'Postal code', reads.text('addressPostalCode'), [
    'zip',
    'zip code',
    'postcode',
  ]),
  f('address_country', 'Country code', reads.country('addressCountry'), ['country']),
  f('notes', 'Notes', reads.text('notes')),
];

const SUPPLIER_DEFAULTS: Draft = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  taxId: '',
  category: '',
  paymentTermsDays: null,
  addressLine1: '',
  addressLine2: '',
  addressCity: '',
  addressRegion: '',
  addressPostalCode: '',
  addressCountry: null,
  notes: '',
  customFields: {},
};

export function parseSupplierRow(
  row: Record<string, string>,
): ReturnType<typeof parseRow<typeof supplierInputSchema>> {
  return parseRow(SUPPLIER_FIELDS, SUPPLIER_DEFAULTS, supplierInputSchema, row);
}
export type ParsedSupplier = Parsed<SupplierInput>;
