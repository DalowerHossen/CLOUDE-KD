// path: lib/company/forms.ts
// Field lists of the settings screens. The generic section form (components/settings/section-form.tsx) renders them,
// and the server checks every save against the strict section schema, so the list only decides what is shown.
import { COUNTRY_CODES, countryName } from './countries';
import { DISPLAY_CURRENCIES, DUE_DAYS, FONT_KEYS, type SectionKey } from './sections';

export type FieldKind =
  | 'bool'
  | 'lines'
  | 'nullable_number'
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'url'
  | 'select'
  | 'color'
  | 'number'
  | 'multi'
  | 'contacts';

export interface FieldSpec {
  name: string;
  /** Key under s07Company.settings.fields. */
  label: string;
  kind: FieldKind;
  max?: number;
  upper?: boolean;
  options?: readonly { value: string; label: string }[];
  /** Select values are sent as numbers. */
  numeric?: boolean;
  /** An empty text is stored as null. */
  emptyIsNull?: boolean;
  /** Dotted path into the section value, for nested objects. */
  path?: readonly string[];
}

const country = [
  { value: '', label: '-' },
  ...COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c) })),
];
const yesNo = (a: string, b: string): readonly { value: string; label: string }[] => [
  { value: a, label: a },
  { value: b, label: b },
];

export const FORMS: Partial<Record<SectionKey, readonly FieldSpec[]>> = {
  profile: [
    { name: 'legalName', label: 'legalName', kind: 'text', max: 200 },
    { name: 'tradingName', label: 'tradingName', kind: 'text', max: 200 },
    { name: 'taxId', label: 'taxId', kind: 'text', max: 40 },
    { name: 'registrationNumber', label: 'registrationNumber', kind: 'text', max: 40 },
    { name: 'email', label: 'email', kind: 'email', max: 254 },
    { name: 'phone', label: 'phone', kind: 'tel', max: 30 },
    { name: 'website', label: 'website', kind: 'url', max: 200 },
    { name: 'addressLine1', label: 'addressLine1', kind: 'text', max: 200 },
    { name: 'addressLine2', label: 'addressLine2', kind: 'text', max: 200 },
    { name: 'city', label: 'city', kind: 'text', max: 100 },
    { name: 'region', label: 'region', kind: 'text', max: 100 },
    { name: 'postalCode', label: 'postalCode', kind: 'text', max: 20 },
    { name: 'country', label: 'country', kind: 'select', options: country },
    { name: 'contacts', label: 'contacts', kind: 'contacts' },
  ],
  branding: [
    { name: 'primaryColor', label: 'primaryColor', kind: 'color' },
    { name: 'accentColor', label: 'accentColor', kind: 'color' },
    {
      name: 'fontKey',
      label: 'fontKey',
      kind: 'select',
      options: FONT_KEYS.map((k) => ({ value: k, label: k })),
    },
  ],
  invoice: [
    { name: 'invoicePrefix', label: 'invoicePrefix', kind: 'text', max: 10, upper: true },
    { name: 'estimatePrefix', label: 'estimatePrefix', kind: 'text', max: 10, upper: true },
    { name: 'creditNotePrefix', label: 'creditNotePrefix', kind: 'text', max: 10, upper: true },
    {
      name: 'numbering',
      label: 'numbering',
      kind: 'select',
      options: [
        { value: 'sequential', label: 'sequential' },
        { value: 'yearly', label: 'yearly' },
      ],
    },
    { name: 'padding', label: 'padding', kind: 'number' },
    { name: 'nextNumber', label: 'nextNumber', kind: 'number' },
    {
      name: 'dueDays',
      label: 'dueDays',
      kind: 'select',
      numeric: true,
      options: DUE_DAYS.map((d) => ({ value: String(d), label: String(d) })),
    },
    { name: 'terms', label: 'terms', kind: 'textarea', max: 2000 },
    { name: 'notes', label: 'notes', kind: 'textarea', max: 2000 },
    { name: 'footer', label: 'footer', kind: 'textarea', max: 500 },
  ],
  display: [
    {
      name: 'displayCurrencies',
      label: 'displayCurrencies',
      kind: 'multi',
      options: DISPLAY_CURRENCIES.map((c) => ({ value: c, label: c })),
    },
    {
      name: 'dateFormat',
      label: 'dateFormat',
      kind: 'select',
      options: [
        { value: 'yyyy-mm-dd', label: 'yyyy-mm-dd' },
        { value: 'dd/mm/yyyy', label: 'dd/mm/yyyy' },
        { value: 'mm/dd/yyyy', label: 'mm/dd/yyyy' },
      ],
    },
    {
      name: 'numberFormat',
      label: 'numberFormat',
      kind: 'select',
      options: [
        { value: '1,234.56', label: '1,234.56' },
        { value: '1.234,56', label: '1.234,56' },
        { value: '1 234,56', label: '1 234,56' },
      ],
    },
    { name: 'weekStart', label: 'weekStart', kind: 'select', options: yesNo('monday', 'sunday') },
  ],
  security: [
    { name: 'requireTwoFactor', label: 'requireTwoFactor', kind: 'bool' },
    {
      name: 'staffSessionTimeoutMinutes',
      label: 'staffSessionTimeoutMinutes',
      kind: 'nullable_number',
    },
    { name: 'ipAllowlist', label: 'ipAllowlist', kind: 'lines' },
  ],
  approval: [
    { name: 'ownerApprovalActions', label: 'ownerApprovalActions', kind: 'lines' },
    { name: 'staffAmountCap', label: 'staffAmountCap', kind: 'text', max: 20, emptyIsNull: true },
  ],
  notifications: [
    {
      name: 'invoice',
      label: 'recipientsInvoice',
      kind: 'select',
      path: ['recipients'],
      options: yesNo('owner', 'all'),
    },
    {
      name: 'payment',
      label: 'recipientsPayment',
      kind: 'select',
      path: ['recipients'],
      options: yesNo('owner', 'all'),
    },
    {
      name: 'system',
      label: 'recipientsSystem',
      kind: 'select',
      path: ['recipients'],
      options: yesNo('owner', 'all'),
    },
    {
      name: 'summary',
      label: 'summary',
      kind: 'select',
      options: [
        { value: 'off', label: 'off' },
        { value: 'daily', label: 'daily' },
        { value: 'weekly', label: 'weekly' },
      ],
    },
  ],
};

/** Sections that owners edit on their own screen. */
export const EDITABLE_SECTIONS = [
  'profile',
  'branding',
  'invoice',
  'display',
  'notifications',
  'security',
  'approval',
] as const;
export type EditableSection = (typeof EDITABLE_SECTIONS)[number];
