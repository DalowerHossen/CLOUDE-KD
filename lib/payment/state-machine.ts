// path: lib/payment/state-machine.ts
// Payment state machine (mirrors the database trigger kd_payment_guard). The core asks here before it changes a status.
import { CARD_SURCHARGE_PERCENT } from '@/config/payment-risk';
import { Money } from '@/lib/utils/currency';
import type { PaymentStatus } from '@/types/contracts';

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ['requires_action', 'authorized', 'captured', 'failed', 'pending_review', 'voided'],
  requires_action: ['authorized', 'captured', 'failed', 'voided', 'pending_review'],
  authorized: ['captured', 'voided', 'failed', 'pending_review'],
  pending_review: ['captured', 'voided', 'failed'],
  captured: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded'],
  failed: [],
  voided: [],
  refunded: [],
};

/** Statuses in which an invoice is blocked from a second payment. */
export const OPEN_STATUSES: readonly PaymentStatus[] = [
  'created',
  'requires_action',
  'authorized',
  'pending_review',
];

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || PAYMENT_TRANSITIONS[from].includes(to);
}

export function isOpen(status: PaymentStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isTerminal(status: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[status].length === 0;
}

/** True when money was taken (and not fully given back). */
export function holdsMoney(status: PaymentStatus): boolean {
  return status === 'captured' || status === 'partially_refunded';
}

export function refundable(captured: Money, refunded: Money): Money {
  const left = captured.sub(refunded);
  return left.gt('0') ? left : Money.zero();
}

export function statusAfterRefund(captured: Money, refundedTotal: Money): PaymentStatus {
  return refundedTotal.gte(captured) ? 'refunded' : 'partially_refunded';
}

/** The card surcharge for an amount, rounded to the money precision. Zero when the configured percent is zero. */
export function surchargeFor(amount: Money, percent: string = CARD_SURCHARGE_PERCENT): Money {
  if (Money.parse(percent).lte('0')) return Money.zero();
  return amount.percent(percent);
}
