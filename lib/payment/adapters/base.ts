// path: lib/payment/adapters/base.ts
// What adapter files import. Re-exports the contract types and offers the small helpers every adapter uses, so no
// adapter repeats them. Adapters never receive or return card numbers; they work with tokens from the processor's form.
export type {
  AdapterContext,
  AdapterModule,
  AuthorizeInput,
  CaptureInput,
  CardIdentity,
  CheckoutSession,
  CheckoutSessionInput,
  CredentialField,
  DeclineCategory,
  DisputeEvidenceInput,
  NormalizedWebhookEvent,
  NormalizedWebhookEventType,
  ProcessorAdapter,
  ProcessorCapabilities,
  ProcessorEnvironment,
  ProcessorId,
  ProcessorMetadata,
  ProcessorMode,
  ProcessorTransaction,
  ProcessorTransactionStatus,
  RefundInput,
  TestConnectionResult,
  ThreeDSPolicy,
  ThreeDSResult,
  VoidInput,
  WebhookRequest,
} from '@/types/contracts';
export { DECLINE_CATEGORIES, PROCESSOR_IDS } from '@/types/contracts';

import type {
  DeclineCategory,
  ProcessorAdapter,
  ProcessorTransaction,
  ThreeDSResult,
} from '@/types/contracts';
import { Money } from '@/lib/utils/currency';

/** A 3DS result for a payment that never asked for 3DS. */
export const NO_THREE_DS: ThreeDSResult = Object.freeze({
  requested: false,
  completed: false,
  authenticated: false,
  liabilityShift: null,
});

export interface TransactionDraft {
  status: ProcessorTransaction['status'];
  amount: Money;
  processorTransactionId?: string | null;
  declineCategory?: DeclineCategory | null;
  rawCode?: string | null;
  message?: string | null;
  threeDS?: ThreeDSResult;
  avsPostalCodeMatch?: boolean | null;
  cardIdentity?: ProcessorTransaction['cardIdentity'];
  requiredAction?: ProcessorTransaction['requiredAction'];
}

/** Builds a complete ProcessorTransaction so adapters cannot forget a field. */
export function buildTransaction(draft: TransactionDraft): ProcessorTransaction {
  return {
    status: draft.status,
    processorTransactionId: draft.processorTransactionId ?? null,
    amount: draft.amount,
    declineCategory: draft.declineCategory ?? null,
    rawCode: draft.rawCode ?? null,
    message: draft.message ?? null,
    threeDS: draft.threeDS ?? NO_THREE_DS,
    avsPostalCodeMatch: draft.avsPostalCodeMatch ?? null,
    cardIdentity: draft.cardIdentity ?? null,
    requiredAction: draft.requiredAction ?? null,
  };
}

/** Compares two secrets or signatures without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

/** Narrow type helper for adapter files: `export const adapter = defineAdapter({ ... })`. */
export function defineAdapter(adapter: ProcessorAdapter): ProcessorAdapter {
  return adapter;
}

const CENTS = 100n;

/**
 * Converts USD to the processor's smallest unit (cents) as an integer string. Money keeps four places; anything below
 * half a cent is dropped and half a cent or more rounds up.
 */
export function toMinorUnits(amount: Money): string {
  const [integer = '0', fraction = ''] = amount.toDbString().replace('-', '').split('.');
  const digits = fraction.padEnd(4, '0');
  let cents = BigInt(integer) * CENTS + BigInt(digits.slice(0, 2));
  if (digits.charCodeAt(2) >= 53) cents += 1n; // character code of "5"
  return `${amount.toDbString().startsWith('-') ? '-' : ''}${cents}`;
}

/** Cents (integer or integer text) back to Money. */
export function fromMinorUnits(cents: number | string): Money {
  const text = String(cents);
  if (!/^-?\d{1,15}$/.test(text)) throw new RangeError('Minor units must be a whole number.');
  const negative = text.startsWith('-');
  const digits = (negative ? text.slice(1) : text).padStart(3, '0');
  const value = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  return Money.parse(negative ? `-${value}` : value);
}
