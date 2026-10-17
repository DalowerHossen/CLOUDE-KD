// path: lib/payment/card-rules.ts
// Card payment rules (REQ-CARD). Pure decisions over counts; the counts come from the database function kd_card_stats.
// The identity of a card is an HMAC of the processor's fingerprint or vault token, never the card number.
import { createHmac } from 'node:crypto';
import {
  CARD_ATTEMPTS_PER_HOUR,
  CARD_FAIL_LIMIT,
  IP_ATTEMPTS_PER_HOUR,
  IP_DISTINCT_CARDS_PER_HOUR,
} from '@/config/payment-risk';
import type { CardIdentity, ProcessorId } from '@/types/contracts';

export interface CardStats {
  /** Counted failures of this card in the rolling window. */
  countedFailures: number;
  /** Authorize and charge attempts of this card in the velocity window. */
  cardAttempts: number;
  /** Attempts from this address in the velocity window. */
  ipAttempts: number;
  /** Other cards seen from this address in the velocity window. */
  ipDistinctCards: number;
  /** Payments of this card on this invoice inside the same-invoice window that were authorized or paid. */
  paidSameInvoice: number;
}

export const CARD_RULE_CODES = [
  'card_blacklisted',
  'same_card_same_invoice',
  'card_fail_limit',
  'card_velocity',
  'ip_velocity',
  'ip_distinct_cards',
] as const;
export type CardRuleCode = (typeof CARD_RULE_CODES)[number];

export interface CardRuleDecision {
  allowed: boolean;
  code: CardRuleCode | null;
}

const ALLOWED: CardRuleDecision = { allowed: true, code: null };

function refuse(code: CardRuleCode): CardRuleDecision {
  return { allowed: false, code };
}

/** Rules that depend on the address only; they can run before the processor is called. */
export function evaluateAddressRules(stats: Pick<CardStats, 'ipAttempts'>): CardRuleDecision {
  if (stats.ipAttempts >= IP_ATTEMPTS_PER_HOUR) return refuse('ip_velocity');
  return ALLOWED;
}

/**
 * All rules, in a fixed order. Counted failures: after CARD_FAIL_LIMIT of them the next attempt is refused (the third
 * attempt with the default limit of two).
 */
export function evaluateCardRules(input: {
  blacklisted: boolean;
  stats: CardStats;
}): CardRuleDecision {
  const { stats } = input;
  if (input.blacklisted) return refuse('card_blacklisted');
  if (stats.paidSameInvoice >= 1) return refuse('same_card_same_invoice');
  if (stats.countedFailures >= CARD_FAIL_LIMIT) return refuse('card_fail_limit');
  if (stats.cardAttempts >= CARD_ATTEMPTS_PER_HOUR) return refuse('card_velocity');
  const address = evaluateAddressRules(stats);
  if (!address.allowed) return address;
  if (stats.ipDistinctCards >= IP_DISTINCT_CARDS_PER_HOUR) return refuse('ip_distinct_cards');
  return ALLOWED;
}

/** Text for the administrator and the audit log. Never shown to the payer in detail. */
export function describeRule(code: CardRuleCode): string {
  switch (code) {
    case 'card_blacklisted':
      return 'The card is on the blocked list.';
    case 'same_card_same_invoice':
      return 'This card already paid this invoice recently.';
    case 'card_fail_limit':
      return 'This card failed too many times.';
    case 'card_velocity':
      return 'Too many attempts with this card.';
    case 'ip_velocity':
      return 'Too many attempts from this address.';
    case 'ip_distinct_cards':
      return 'Too many different cards from this address.';
  }
}

/** HMAC-SHA-256 of "processor:type:value" with the secret key. 64 lower-case hex characters. */
export function identityHmac(
  key: string,
  processorId: ProcessorId,
  identity: CardIdentity,
): string {
  return createHmac('sha256', key)
    .update(`${processorId}:${identity.type}:${identity.value}`)
    .digest('hex');
}
