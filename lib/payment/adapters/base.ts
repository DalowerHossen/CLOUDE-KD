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
import type { Money } from '@/lib/utils/currency';

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
