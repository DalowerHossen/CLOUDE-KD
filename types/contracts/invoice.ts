// path: types/contracts/invoice.ts
import type { Uuid } from './common';
import type { Money } from '@/lib/utils/currency';

export type InvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'disputed';

export interface InvoiceForPayment {
  invoiceId: Uuid;
  companyId: Uuid;
  clientId: Uuid;
  invoiceNumber: string;
  status: InvoiceStatus;
  amountDue: Money;
  currency: 'USD';
  /** Billing postal code and country as stored on the invoice at send time. */
  billingPostalCode: string | null;
  billingCountry: string | null;
  version: number;
}

/** One order of an outside store (a checkout session): the customer, what is paid and the order reference. */
export interface OrderInvoiceInput {
  companyId: Uuid;
  /** The person on whose behalf the invoice is made (the owner who made the API key). */
  createdBy: Uuid;
  /** The order number in the merchant's store; shown on the invoice as the purchase order number. */
  reference: string;
  customerName: string;
  customerEmail: string;
  /** ISO 3166-1 alpha-2. */
  customerCountry: string;
  customerPostalCode: string | null;
  description: string;
  /** The total of the order, tax included. Above zero. */
  amount: Money;
}

export interface InvoiceService {
  /** Makes a sent invoice for one outside order (one line, the total) so that it can be paid through a payment link. */
  createForOrder(input: OrderInvoiceInput): Promise<{ invoiceId: Uuid; invoiceNumber: string }>;
  /** Voids an unpaid order invoice (the order was cancelled in the store). A paid invoice is refused. */
  voidForOrder(input: {
    companyId: Uuid;
    invoiceId: Uuid;
    voidedBy: Uuid;
    reason: string;
  }): Promise<void>;
  getForPayment(invoiceId: Uuid): Promise<InvoiceForPayment>;
  applyPayment(input: {
    invoiceId: Uuid;
    paymentId: Uuid;
    amount: Money;
  }): Promise<{ status: InvoiceStatus }>;
  markDisputed(invoiceId: Uuid): Promise<void>;
  snapshot(invoiceId: Uuid): Promise<{ fileId: Uuid; contentHash: string }>;
}
