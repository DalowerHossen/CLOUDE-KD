// path: config/payment-methods.ts
// Local payment methods offered through Licensed Partners. Codes are internal and labels are generic: the platform
// never writes the name of a payment brand (REQ rule 18). Which method is on, in which country, at what fee and in
// which order is decided by the platform team in the database; this file is the catalogue they choose from.
import type { PlanKey } from '@/config/plans';

export type MethodKind =
  | 'card'
  | 'bank_transfer'
  | 'mobile_wallet'
  | 'instant_bank'
  | 'qr_code'
  | 'bank_debit'
  | 'cash_voucher';

export interface PaymentMethodDefinition {
  code: string;
  kind: MethodKind;
  /** Shown to the owner and on the checkout. */
  label: string;
  /** Name of an icon in the icon set (no brand logos). */
  icon: string;
  /** Countries (ISO 3166 alpha-2) where the method can be offered. */
  countries: readonly string[];
  /** Lowest plan that may use the method. */
  minPlan: PlanKey;
  /** Shown to the payer when the method is chosen. */
  instructions: string;
}

/** Asian markets the platform serves first. */
export const MARKET_COUNTRIES = [
  'BD',
  'IN',
  'PK',
  'LK',
  'NP',
  'ID',
  'MY',
  'SG',
  'TH',
  'VN',
  'PH',
  'JP',
  'KR',
  'HK',
] as const;

export const PAYMENT_METHODS: readonly PaymentMethodDefinition[] = [
  {
    code: 'card',
    kind: 'card',
    label: 'Card',
    icon: 'credit-card',
    countries: MARKET_COUNTRIES,
    minPlan: 'free',
    instructions: 'Pay with a debit or credit card on the secure payment form.',
  },
  {
    code: 'mobile_wallet_a',
    kind: 'mobile_wallet',
    label: 'Mobile wallet A',
    icon: 'smartphone',
    countries: ['BD', 'PK', 'LK', 'NP', 'PH'],
    minPlan: 'pro',
    instructions:
      'You are sent to the licensed partner to approve the payment in your mobile wallet app.',
  },
  {
    code: 'mobile_wallet_b',
    kind: 'mobile_wallet',
    label: 'Mobile wallet B',
    icon: 'smartphone',
    countries: ['ID', 'MY', 'TH', 'VN', 'PH'],
    minPlan: 'pro',
    instructions:
      'You are sent to the licensed partner to approve the payment in your mobile wallet app.',
  },
  {
    code: 'bank_transfer_local',
    kind: 'bank_transfer',
    label: 'Local bank transfer',
    icon: 'landmark',
    countries: MARKET_COUNTRIES,
    minPlan: 'free',
    instructions:
      'Send the amount to the bank account shown and keep the transfer reference. Payment is confirmed when the bank receipt is checked.',
  },
  {
    code: 'instant_bank_qr',
    kind: 'instant_bank',
    label: 'Instant bank payment',
    icon: 'zap',
    countries: ['IN', 'SG', 'MY', 'TH', 'ID', 'HK'],
    minPlan: 'pro',
    instructions: 'Approve the payment in your bank app. The money arrives within seconds.',
  },
  {
    code: 'local_qr_code',
    kind: 'qr_code',
    label: 'QR code payment',
    icon: 'qr-code',
    countries: ['SG', 'MY', 'TH', 'ID', 'VN', 'HK', 'KR', 'JP'],
    minPlan: 'business',
    instructions: 'Scan the code with your banking or wallet app and confirm the amount.',
  },
  {
    code: 'bank_debit_local',
    kind: 'bank_debit',
    label: 'Local bank debit',
    icon: 'building',
    countries: ['IN', 'JP', 'KR', 'SG'],
    minPlan: 'business',
    instructions:
      'Authorise a direct debit from your bank account. It can take up to three working days.',
  },
  {
    code: 'cash_voucher_local',
    kind: 'cash_voucher',
    label: 'Cash voucher',
    icon: 'ticket',
    countries: ['BD', 'IN', 'PK', 'ID', 'PH', 'VN'],
    minPlan: 'enterprise',
    instructions:
      'Get a voucher code and pay cash at a partner shop. The code is valid for three days.',
  },
];

/** How many methods a company may switch on, by plan (null is no limit). The plan service of STEP 14.5 can override it. */
export const METHODS_PER_PLAN: Readonly<Record<PlanKey, number | null>> = {
  free: 2,
  pro: 4,
  business: 6,
  enterprise: null,
};

export const PLAN_ORDER: readonly PlanKey[] = ['free', 'pro', 'business', 'enterprise'];
