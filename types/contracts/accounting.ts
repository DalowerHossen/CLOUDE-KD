// path: types/contracts/accounting.ts

/** Accounting is fed by domain events only (invoice.*, payment.*, refund, payout, expense.*, payroll.*). */
export interface AccountingService {
  /** Re-posts journal entries for one event id; idempotent. */
  repost(eventId: string): Promise<void>;
}
