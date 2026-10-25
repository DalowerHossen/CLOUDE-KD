// path: types/contracts/payment-adapter.ts
// Contract between the payment core (STEP 10) and the 16 processor adapters (STEPs 11 and 12).
import type { Money } from '@/lib/utils/currency';

export const PROCESSOR_IDS = [
  'stripe',
  'nmi',
  'adyen',
  'verifone',
  'braintree',
  'bluesnap',
  'square',
  'payoneer',
  'fastspring',
  'paddle',
  'payproglobal',
  'paypal',
  'payarc',
  'rapyd',
  'authorizenet',
  'custom',
] as const;
export type ProcessorId = (typeof PROCESSOR_IDS)[number];

export type ProcessorEnvironment = 'sandbox' | 'live';

export interface ProcessorMode {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface ProcessorCapabilities {
  supportsAuthCapture: boolean;
  supportsThreeDS: boolean;
  supportsRefund: boolean;
  supportsPartialRefund: boolean;
  supportsRecurring: boolean;
  supportsPayout: boolean;
  isMerchantOfRecord: boolean;
  /** Front-end modes. A processor without modes lists exactly one default mode. */
  modes: readonly ProcessorMode[];
  /** ISO 4217 currencies the processor accepts for collection. */
  currencies: readonly string[];
}

export interface CredentialField {
  key: string;
  label: string;
  /** Secret fields are never shown again after saving. */
  secret: boolean;
  required: boolean;
  /** Regular expression source the value must match (checked on save). */
  pattern?: string;
  helpText?: string;
}

export const DECLINE_CATEGORIES = [
  'insufficient_funds',
  'invalid_number',
  'invalid_expiry',
  'invalid_cvv',
  'otp_failed',
  'three_ds_failed',
  'processor_fraud_signal',
  'do_not_honor',
  'processor_error',
  'other',
] as const;
export type DeclineCategory = (typeof DECLINE_CATEGORIES)[number];

export interface CardIdentity {
  /** `fingerprint` is the processor's card fingerprint; `token` is a stable vault token. */
  type: 'fingerprint' | 'token';
  value: string;
  /** The last four digits of the card, when the processor returned them. Never more of the number. */
  last4?: string;
  /** The card brand in lower case (for example `visa`), when the processor returned it. */
  brand?: string;
}

export type ThreeDSPolicy = 'required' | 'preferred' | 'disabled';

export interface ThreeDSResult {
  requested: boolean;
  completed: boolean;
  authenticated: boolean;
  liabilityShift: boolean | null;
}

/** Everything an adapter call needs. Credentials are decrypted by the caller and live in memory for one call. */
export interface AdapterContext {
  credentials: Readonly<Record<string, string>>;
  environment: ProcessorEnvironment;
  mode: string;
  correlationId: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  details?: Record<string, string>;
}

export interface CheckoutSessionInput {
  idempotencyKey: string;
  amount: Money;
  invoiceId: string;
  companyId: string;
  returnUrl: string;
  threeDS: ThreeDSPolicy;
}

export interface CheckoutSession {
  /** Public data the secure form needs (client token, public key, session id). Never a secret. */
  clientConfig: Record<string, string>;
  expiresAt: string | null;
}

export interface AuthorizeInput {
  idempotencyKey: string;
  amount: Money;
  invoiceId: string;
  companyId: string;
  /** Token produced by the processor's own secure form. */
  paymentToken: string;
  billing: { postalCode: string | null; country: string | null };
  payerIp: string;
  returnUrl: string;
  threeDS: ThreeDSPolicy;
  metadata: Readonly<Record<string, string>>;
}

export interface CaptureInput {
  idempotencyKey: string;
  processorTransactionId: string;
  amount: Money;
}

export interface VoidInput {
  idempotencyKey: string;
  processorTransactionId: string;
}

export interface RefundInput {
  idempotencyKey: string;
  processorTransactionId: string;
  amount: Money;
  reason: string | null;
}

export type ProcessorTransactionStatus =
  | 'authorized'
  | 'captured'
  | 'requires_action'
  | 'declined'
  | 'voided'
  | 'refunded'
  | 'pending'
  | 'error';

export interface ProcessorTransaction {
  status: ProcessorTransactionStatus;
  processorTransactionId: string | null;
  amount: Money;
  declineCategory: DeclineCategory | null;
  rawCode: string | null;
  message: string | null;
  threeDS: ThreeDSResult;
  /** Address verification result for the postal code, or null when not available. */
  avsPostalCodeMatch: boolean | null;
  cardIdentity: CardIdentity | null;
  requiredAction: {
    kind: 'redirect' | 'sdk_challenge';
    url: string | null;
    clientSecret: string | null;
  } | null;
}

export interface WebhookRequest {
  headers: Readonly<Record<string, string>>;
  rawBody: string;
}

export type NormalizedWebhookEventType =
  | 'payment.authorized'
  | 'payment.captured'
  | 'payment.failed'
  | 'payment.voided'
  | 'payment.refunded'
  | 'dispute.opened'
  | 'dispute.updated'
  | 'dispute.closed'
  | 'subscription.updated'
  | 'payout.updated'
  | 'unknown';

export interface NormalizedWebhookEvent {
  processorId: ProcessorId;
  /** Unique per processor; used for duplicate detection. */
  eventId: string;
  type: NormalizedWebhookEventType;
  processorTransactionId: string | null;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface DisputeEvidenceInput {
  disputeId: string;
  processorTransactionId: string;
  reasonCode: string | null;
  sections: Readonly<Record<string, unknown>>;
}

export interface ProcessorAdapter {
  readonly id: ProcessorId;
  readonly displayName: string;
  readonly capabilities: ProcessorCapabilities;
  readonly credentialFields: readonly CredentialField[];

  testConnection(context: AdapterContext): Promise<TestConnectionResult>;
  createCheckoutSession(
    context: AdapterContext,
    input: CheckoutSessionInput,
  ): Promise<CheckoutSession>;
  authorize(context: AdapterContext, input: AuthorizeInput): Promise<ProcessorTransaction>;
  /** Present when `capabilities.supportsAuthCapture` is true. */
  capture?(context: AdapterContext, input: CaptureInput): Promise<ProcessorTransaction>;
  /** Present when `capabilities.supportsAuthCapture` is true. */
  voidAuthorization?(context: AdapterContext, input: VoidInput): Promise<ProcessorTransaction>;
  /** Single-step sale, present when the processor has no separate authorize and capture. */
  charge?(context: AdapterContext, input: AuthorizeInput): Promise<ProcessorTransaction>;
  refund(context: AdapterContext, input: RefundInput): Promise<ProcessorTransaction>;
  getTransaction(
    context: AdapterContext,
    processorTransactionId: string,
  ): Promise<ProcessorTransaction>;

  /** Returns true only when the signature (and timestamp window, where the processor defines one) is valid. */
  verifyWebhook(context: AdapterContext, request: WebhookRequest): Promise<boolean>;
  parseWebhook(request: WebhookRequest): NormalizedWebhookEvent;
  cardIdentity(transaction: ProcessorTransaction): CardIdentity | null;
  mapDecline(raw: { code: string | null; message: string | null }): DeclineCategory;
  evidenceFormat?(input: DisputeEvidenceInput): Promise<Record<string, unknown>>;
}

/** Entry shape of `config/processors.ts` (STEP 10). */
export interface ProcessorMetadata {
  id: ProcessorId;
  name: string;
  docsUrl: string;
  sandboxUrl: string | null;
  step: 11 | 12;
}

/** What each adapter file exports. */
export interface AdapterModule {
  adapter: ProcessorAdapter;
}
