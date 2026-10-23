// path: lib/payment/verification.ts
// Payment verification (REQ-VERIFY). Pure decisions; the service gathers the facts.
//  1. 3D Secure is requested whenever the processor supports it.
//  2. If 3DS was not completed, the payment is taken only when the billing postal code AND the payer's IP country match
//     the invoice. Otherwise it is held for manual review and not captured.
import {
  AUTH_VALIDITY_HOURS_BY_PROCESSOR,
  DEFAULT_AUTH_VALIDITY_HOURS,
  REVIEW_HOLD_HOURS,
} from '@/config/payment-risk';
import type { ProcessorAdapter, ThreeDSPolicy, ThreeDSResult } from '@/types/contracts';

export const REVIEW_REASONS = [
  'postal_code_mismatch',
  'postal_code_missing',
  'ip_country_mismatch',
  'ip_country_unknown',
  'invoice_data_missing',
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

/** Request 3DS on every payment whenever the processor supports it; never fail a payment only because it is unavailable. */
export function threeDSPolicyFor(adapter: ProcessorAdapter): ThreeDSPolicy {
  return adapter.capabilities.supportsThreeDS ? 'preferred' : 'disabled';
}

/** Upper case, letters and digits only, so "sw1a 1aa", "SW1A-1AA" and "SW1A1AA" are the same. */
export function normalizePostal(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function postalMatches(given: string | null, invoice: string | null): boolean | null {
  const a = normalizePostal(given);
  const b = normalizePostal(invoice);
  if (a === '' || b === '') return null;
  return a === b;
}

export function threeDSPassed(result: ThreeDSResult | null | undefined): boolean {
  return Boolean(result && result.requested && result.completed && result.authenticated);
}

export interface VerificationFacts {
  threeDS: ThreeDSResult | null;
  /** Postal code the payer typed in the secure form (or null). */
  givenPostalCode: string | null;
  invoicePostalCode: string | null;
  /** Result of the processor's own address check, when it did one. */
  avsPostalCodeMatch: boolean | null;
  /** Country of the payer's IP address (ISO code) or null when unknown. */
  ipCountry: string | null;
  invoiceCountry: string | null;
}

export interface VerificationOutcome {
  outcome: 'capture' | 'review';
  reasons: ReviewReason[];
  threeDSPassed: boolean;
}

/** Decides whether a payment can be captured now or must wait for a reviewer. */
export function assessVerification(facts: VerificationFacts): VerificationOutcome {
  if (threeDSPassed(facts.threeDS)) return { outcome: 'capture', reasons: [], threeDSPassed: true };
  const reasons: ReviewReason[] = [];
  if (facts.invoiceCountry === null || normalizePostal(facts.invoicePostalCode) === '') {
    reasons.push('invoice_data_missing');
  }
  const given = postalMatches(facts.givenPostalCode, facts.invoicePostalCode);
  if (facts.avsPostalCodeMatch === false || given === false) reasons.push('postal_code_mismatch');
  else if (given === null && facts.avsPostalCodeMatch !== true) reasons.push('postal_code_missing');
  if (facts.ipCountry === null) reasons.push('ip_country_unknown');
  else if (
    facts.invoiceCountry !== null &&
    facts.ipCountry.toUpperCase() !== facts.invoiceCountry.toUpperCase()
  ) {
    reasons.push('ip_country_mismatch');
  }
  return {
    outcome: reasons.length === 0 ? 'capture' : 'review',
    reasons,
    threeDSPassed: false,
  };
}

/** The review hold never outlasts the processor's authorization. */
export function reviewHoldHours(processorId: string): number {
  const validity = AUTH_VALIDITY_HOURS_BY_PROCESSOR[processorId] ?? DEFAULT_AUTH_VALIDITY_HOURS;
  return Math.min(REVIEW_HOLD_HOURS, validity);
}

export function reviewHoldUntil(processorId: string, now: Date): Date {
  return new Date(now.getTime() + reviewHoldHours(processorId) * 3_600_000);
}

export function describeReason(reason: ReviewReason): string {
  switch (reason) {
    case 'postal_code_mismatch':
      return 'The billing postal code does not match the invoice.';
    case 'postal_code_missing':
      return 'No billing postal code could be checked.';
    case 'ip_country_mismatch':
      return 'The payer is in a different country than the invoice billing address.';
    case 'ip_country_unknown':
      return 'The country of the payer could not be determined.';
    case 'invoice_data_missing':
      return 'The invoice has no billing postal code or country to compare with.';
  }
}
