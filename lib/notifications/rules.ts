// path: lib/notifications/rules.ts
// Which domain events become notifications, and in which words. Pure. The emitting STEP puts these keys in the
// event payload when it has them: number, clientName, amount, href (an internal path such as /invoices/123).
import type { NotificationCategory } from '@/config/notifications';
import type { DomainEventName } from '@/types/events';

export interface EventRule {
  category: NotificationCategory;
  type: string;
  title: string;
  /** Words after the title; {number}, {clientName} and {amount} come from the payload. */
  body: string;
  recipients?: 'owner' | 'all';
}

export const EVENT_RULES: Partial<Record<DomainEventName, EventRule>> = {
  'invoice.created': {
    category: 'invoice',
    type: 'invoice.created',
    title: 'Invoice created',
    body: 'Invoice {number} was created.',
  },
  'invoice.sent': {
    category: 'invoice',
    type: 'invoice.sent',
    title: 'Invoice sent',
    body: 'Invoice {number} was sent to {clientName}.',
  },
  'invoice.viewed': {
    category: 'invoice',
    type: 'invoice.viewed',
    title: 'Invoice viewed',
    body: '{clientName} opened invoice {number}.',
  },
  'invoice.paid': {
    category: 'invoice',
    type: 'invoice.paid',
    title: 'Invoice paid',
    body: 'Invoice {number} was paid.',
  },
  'invoice.partially_paid': {
    category: 'invoice',
    type: 'invoice.partially_paid',
    title: 'Invoice partly paid',
    body: 'A payment was received for invoice {number}.',
  },
  'invoice.overdue': {
    category: 'invoice',
    type: 'invoice.overdue',
    title: 'Invoice overdue',
    body: 'Invoice {number} is overdue.',
  },
  'estimate.approved': {
    category: 'invoice',
    type: 'estimate.approved',
    title: 'Estimate approved',
    body: '{clientName} approved estimate {number}.',
  },
  'estimate.rejected': {
    category: 'invoice',
    type: 'estimate.rejected',
    title: 'Estimate declined',
    body: '{clientName} declined estimate {number}.',
  },
  'payment.captured': {
    category: 'payment',
    type: 'payment.received',
    title: 'Payment received',
    body: 'A payment of {amount} was received.',
  },
  'payment.failed': {
    category: 'payment',
    type: 'payment.failed',
    title: 'Payment failed',
    body: 'A payment of {amount} failed.',
  },
  'payment.refunded': {
    category: 'payment',
    type: 'payment.refunded',
    title: 'Payment refunded',
    body: 'A payment of {amount} was refunded.',
  },
  'payment.pending_review': {
    category: 'payment',
    type: 'payment.pending_review',
    title: 'Payment under review',
    body: 'A payment of {amount} is being reviewed.',
  },
  'dispute.opened': {
    category: 'payment',
    type: 'dispute.opened',
    title: 'Dispute opened',
    body: 'A client disputed a payment of {amount}.',
  },
  'dispute.won': {
    category: 'payment',
    type: 'dispute.won',
    title: 'Dispute won',
    body: 'The dispute for {amount} was decided in your favour.',
  },
  'dispute.lost': {
    category: 'payment',
    type: 'dispute.lost',
    title: 'Dispute lost',
    body: 'The dispute for {amount} was not decided in your favour.',
  },
  'payout.paid': {
    category: 'payment',
    type: 'payout.paid',
    title: 'Payout sent',
    body: 'A payout of {amount} was sent.',
    recipients: 'owner',
  },
  'payout.failed': {
    category: 'payment',
    type: 'payout.failed',
    title: 'Payout failed',
    body: 'A payout of {amount} failed.',
    recipients: 'owner',
  },
  'client.created': {
    category: 'invoice',
    type: 'client.created',
    title: 'Client added',
    body: '{clientName} was added as a client.',
  },
  'kyc.approved': {
    category: 'kyc',
    type: 'kyc.approved',
    title: 'Identity check approved',
    body: 'Your identity check was approved.',
  },
  'kyc.rejected': {
    category: 'kyc',
    type: 'kyc.rejected',
    title: 'Identity check needs attention',
    body: 'Your identity check was not approved. Open it to see what to change.',
  },
  'auth.account_locked': {
    category: 'security',
    type: 'security.account_locked',
    title: 'Sign-in locked',
    body: 'Sign-in to an account of your company was locked.',
  },
  'auth.new_device': {
    category: 'security',
    type: 'security.new_device',
    title: 'New device signed in',
    body: 'A new device signed in to your account.',
  },
  'subscription.renewed': {
    category: 'subscription',
    type: 'subscription.renewed',
    title: 'Subscription renewed',
    body: 'Your subscription was renewed.',
  },
  'subscription.cancelled': {
    category: 'subscription',
    type: 'subscription.cancelled',
    title: 'Subscription cancelled',
    body: 'Your subscription was cancelled.',
  },
  'file.quarantined': {
    category: 'system',
    type: 'system.file_quarantined',
    title: 'A file was not accepted',
    body: 'A file you uploaded did not pass the safety checks.',
    recipients: 'owner',
  },
};

const CATEGORY_BY_PREFIX: Readonly<Record<string, NotificationCategory>> = {
  invoice: 'invoice',
  estimate: 'invoice',
  client: 'invoice',
  payment: 'payment',
  payout: 'payment',
  dispute: 'payment',
  kyc: 'kyc',
  auth: 'security',
  security: 'security',
  subscription: 'subscription',
  billing: 'subscription',
  team: 'team',
  staff: 'team',
};

/** Category from a type such as "invoice.paid"; anything unknown is "system". */
export function categoryOf(type: string): NotificationCategory {
  return CATEGORY_BY_PREFIX[type.split('.')[0] ?? ''] ?? 'system';
}

/** An internal path only: it starts with one slash and has no scheme or second slash, backslash or control character. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  return /^\/(?![/\\])[^\s\u0000-\u001f]*$/.test(value) ? value : null;
}

const text = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 120) : '';

/** Fills {number}, {clientName} and {amount}; a missing value leaves no gap in the sentence. */
export function fillBody(template: string, payload: Record<string, unknown>): string {
  return template
    .replace(/\{(number|clientName|amount)\}/g, (_m, key: string) => text(payload[key]))
    .replace(/\s+([.,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildFromEvent(
  name: DomainEventName,
  payload: Record<string, unknown>,
): { rule: EventRule; body: string; href: string | null; dedupeSuffix: string } | null {
  const rule = EVENT_RULES[name];
  if (!rule) return null;
  const id = text(
    payload.invoiceId ?? payload.paymentId ?? payload.estimateId ?? payload.id ?? payload.number,
  );
  return {
    rule,
    body: fillBody(rule.body, payload),
    href: safeHref(payload.href),
    dedupeSuffix: id,
  };
}
