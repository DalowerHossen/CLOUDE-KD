// path: lib/payment/routing.ts
// Routing (REQ-ADMIN-CONNECT item 7). Rules are checked from the lowest priority number; the first match decides.
// If no rule matches, the payment is cancelled with reason `routing_no_match` and no processor is called. There is no
// failover: when the chosen processor is not usable or fails, the payment fails.
import type { PaymentMethod } from '@/config/processors';
import { Money } from '@/lib/utils/currency';
import type { ProcessorId } from '@/types/contracts';

export const ROUTING_NO_MATCH = 'routing_no_match';
export const PROCESSOR_UNAVAILABLE = 'processor_unavailable';

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  processorId: ProcessorId;
  /** Inclusive bounds in USD; null means no bound. */
  minAmount: Money | null;
  maxAmount: Money | null;
  /** Empty list means any. Countries are upper-case ISO codes. */
  countries: readonly string[];
  methods: readonly string[];
  plans: readonly string[];
  enabled: boolean;
  createdAt: string;
}

export interface RoutingInput {
  amount: Money;
  /** Billing country of the invoice, or null when unknown. */
  country: string | null;
  method: PaymentMethod;
  /** Plan key of the company that is paid. */
  plan: string;
}

export interface RoutingDecision {
  rule: RoutingRule;
  processorId: ProcessorId;
}

function listMatches(list: readonly string[], value: string | null): boolean {
  if (list.length === 0) return true;
  return value !== null && list.includes(value);
}

export function ruleMatches(rule: RoutingRule, input: RoutingInput): boolean {
  if (!rule.enabled) return false;
  if (rule.minAmount && input.amount.lt(rule.minAmount)) return false;
  if (rule.maxAmount && input.amount.gt(rule.maxAmount)) return false;
  if (!listMatches(rule.countries, input.country ? input.country.toUpperCase() : null))
    return false;
  if (!listMatches(rule.methods, input.method)) return false;
  if (!listMatches(rule.plans, input.plan)) return false;
  return true;
}

/** Orders by priority, then by creation time, then by id so the result never depends on the database order. */
export function sortRules(rules: readonly RoutingRule[]): RoutingRule[] {
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** Returns the first matching rule, or null when none matches. */
export function evaluateRouting(
  rules: readonly RoutingRule[],
  input: RoutingInput,
): RoutingDecision | null {
  for (const rule of sortRules(rules)) {
    if (ruleMatches(rule, input)) return { rule, processorId: rule.processorId };
  }
  return null;
}

/** Problems that make a rule useless or contradictory; shown to the administrator on save. */
export function ruleProblems(rule: Pick<RoutingRule, 'minAmount' | 'maxAmount'>): string[] {
  const problems: string[] = [];
  if (rule.minAmount && rule.maxAmount && rule.minAmount.gt(rule.maxAmount)) {
    problems.push('The minimum amount is larger than the maximum amount.');
  }
  return problems;
}

export function parseRuleAmount(value: string | null): Money | null {
  return value === null ? null : Money.parse(value);
}
