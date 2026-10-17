// path: lib/invoice/status.ts
// The invoice status machine. Pure; safe to import in the browser.
import type { InvoiceStatus } from '@/types/contracts';

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'draft',
  'pending_approval',
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'disputed',
];

/** Which status may follow which. A status never goes back to draft once the invoice was sent. */
const NEXT: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ['pending_approval', 'sent', 'void'],
  pending_approval: ['draft', 'sent', 'void'],
  sent: ['viewed', 'partially_paid', 'paid', 'overdue', 'disputed', 'void'],
  viewed: ['partially_paid', 'paid', 'overdue', 'disputed', 'void'],
  partially_paid: ['paid', 'overdue', 'disputed', 'void'],
  overdue: ['viewed', 'partially_paid', 'paid', 'disputed', 'void'],
  disputed: ['sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'],
  paid: ['disputed'],
  void: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return NEXT[from].includes(to);
}

export function nextStatuses(from: InvoiceStatus): readonly InvoiceStatus[] {
  return NEXT[from];
}

/** Lines, dates, client and totals can change only while the invoice is a draft. */
export function isEditable(status: InvoiceStatus): boolean {
  return status === 'draft';
}

/** An invoice that was sent: a legal record that is corrected with a credit note, not by editing. */
export function isSent(status: InvoiceStatus): boolean {
  return status !== 'draft' && status !== 'pending_approval';
}

/** Statuses in which money can still be received. */
export function isOpen(status: InvoiceStatus): boolean {
  return (
    status === 'sent' ||
    status === 'viewed' ||
    status === 'partially_paid' ||
    status === 'overdue' ||
    status === 'disputed'
  );
}

/** A status for the invoice once a payment of `paid` has been applied to `due` (both decimal text, due above zero). */
export function statusAfterPayment(
  current: InvoiceStatus,
  fullyPaid: boolean,
  anyPaid: boolean,
): InvoiceStatus {
  if (current === 'void' || current === 'draft' || current === 'pending_approval') return current;
  if (fullyPaid) return 'paid';
  if (anyPaid) return current === 'disputed' ? 'disputed' : 'partially_paid';
  return current;
}
