// path: types/events.ts
// Domain event names are fixed by docs/execution/CONTRACTS.md. Payloads are plain JSON objects.

export const DOMAIN_EVENT_NAMES = [
  'invoice.created',
  'invoice.sent',
  'invoice.viewed',
  'invoice.paid',
  'invoice.partially_paid',
  'invoice.voided',
  'invoice.overdue',
  'estimate.sent',
  'estimate.approved',
  'estimate.rejected',
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'payment.pending_review',
  'payment.voided',
  'payment.refunded',
  'dispute.opened',
  'dispute.evidence_submitted',
  'dispute.won',
  'dispute.lost',
  'payout.requested',
  'payout.approved',
  'payout.paid',
  'payout.failed',
  'client.created',
  'client.updated',
  'file.stored',
  'file.migrated',
  'file.quarantined',
  'kyc.submitted',
  'kyc.approved',
  'kyc.rejected',
  'auth.account_locked',
  'auth.account_unlocked',
  'auth.new_device',
  'security.event',
  'subscription.created',
  'subscription.renewed',
  'subscription.cancelled',
  'expense.created',
  'payroll.run_approved',
  'payroll.run_paid',
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

export interface DomainEvent<N extends DomainEventName = DomainEventName> {
  id: string;
  name: N;
  /** Null for platform-level events. */
  companyId: string | null;
  /** ISO 8601 UTC. */
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}
