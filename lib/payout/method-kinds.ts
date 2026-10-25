// path: lib/payout/method-kinds.ts
// The ways a company can be paid, and what each way asks for. One source for the form (what to show) and the service
// (what to accept). A way can be limited to some countries: ACH exists only in the United States.

export const PAYOUT_KINDS = [
  'ach',
  'wire',
  'bank_transfer',
  'e_wallet',
  'paypal',
  'payoneer',
  'partner_payout',
] as const;
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

export type PayoutFieldName =
  | 'holderName'
  | 'accountNumber'
  | 'bankName'
  | 'routingCode'
  | 'swiftCode'
  | 'accountType';

export interface PayoutFieldSpec {
  name: PayoutFieldName;
  required: boolean;
  /** Shown in the form: which words to use for this way (a key of strings s16Payout.fields). */
  wording: string;
}

export interface PayoutKindRule {
  /** Countries where the way exists; null means everywhere. */
  countries: readonly string[] | null;
  fields: readonly PayoutFieldSpec[];
  /** Pattern for the account number or the e-mail address, and the message to show. */
  accountPattern: RegExp;
  accountMessage: string;
}

const holder: PayoutFieldSpec = { name: 'holderName', required: true, wording: 'holder' };

export const PAYOUT_KIND_RULES: Readonly<Record<PayoutKind, PayoutKindRule>> = {
  ach: {
    countries: ['US'],
    fields: [
      holder,
      { name: 'bankName', required: true, wording: 'bank' },
      { name: 'routingCode', required: true, wording: 'achRouting' },
      { name: 'accountNumber', required: true, wording: 'achAccount' },
      { name: 'accountType', required: true, wording: 'accountType' },
    ],
    accountPattern: /^[0-9]{4,17}$/,
    accountMessage: 'An ACH account number has 4 to 17 digits.',
  },
  wire: {
    countries: null,
    fields: [
      holder,
      { name: 'bankName', required: true, wording: 'bank' },
      { name: 'accountNumber', required: true, wording: 'iban' },
      { name: 'swiftCode', required: true, wording: 'swift' },
      { name: 'routingCode', required: false, wording: 'routingOptional' },
    ],
    accountPattern: /^[A-Za-z0-9 -]{4,40}$/,
    accountMessage: 'Enter the account number or IBAN.',
  },
  bank_transfer: {
    countries: null,
    fields: [
      holder,
      { name: 'bankName', required: true, wording: 'bank' },
      { name: 'accountNumber', required: true, wording: 'account' },
      { name: 'routingCode', required: false, wording: 'routingOptional' },
    ],
    accountPattern: /^[A-Za-z0-9 -]{4,40}$/,
    accountMessage: 'Enter the account number.',
  },
  e_wallet: {
    countries: null,
    fields: [
      holder,
      { name: 'bankName', required: true, wording: 'walletName' },
      { name: 'accountNumber', required: true, wording: 'walletNumber' },
    ],
    accountPattern: /^[A-Za-z0-9+ -]{4,40}$/,
    accountMessage: 'Enter the wallet number or ID.',
  },
  paypal: {
    countries: null,
    fields: [holder, { name: 'accountNumber', required: true, wording: 'paypalEmail' }],
    accountPattern: /^[^\s@<>]{1,64}@[^\s@<>]{1,200}\.[^\s@<>]{2,24}$/,
    accountMessage: 'Enter the e-mail address of the account.',
  },
  payoneer: {
    countries: null,
    fields: [holder, { name: 'accountNumber', required: true, wording: 'payoneerId' }],
    accountPattern: /^[A-Za-z0-9@._+ -]{4,60}$/,
    accountMessage: 'Enter the payee ID or the e-mail address of the account.',
  },
  partner_payout: {
    countries: null,
    fields: [
      holder,
      { name: 'bankName', required: true, wording: 'bank' },
      { name: 'accountNumber', required: true, wording: 'account' },
    ],
    accountPattern: /^[A-Za-z0-9 -]{4,40}$/,
    accountMessage: 'Enter the account number.',
  },
};

export const ACCOUNT_TYPES = ['checking', 'savings'] as const;

export function kindsForCountry(country: string): readonly PayoutKind[] {
  return PAYOUT_KINDS.filter((k) => {
    const only = PAYOUT_KIND_RULES[k].countries;
    return only === null || only.includes(country);
  });
}

/** The short hint a page may show: the last four characters, or the domain of an e-mail address. */
export function hintFor(kind: PayoutKind, accountNumber: string): string {
  if (kind === 'paypal') {
    const at = accountNumber.lastIndexOf('@');
    return `account at ${accountNumber.slice(at + 1)}`.slice(0, 40);
  }
  const compact = accountNumber.replace(/[^A-Za-z0-9]/g, '');
  return `ending ${compact.slice(-4)}`;
}
