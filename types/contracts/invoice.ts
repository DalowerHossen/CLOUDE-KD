// path: types/contracts/invoice.ts
import type { Uuid } from './common';
import type { Money } from '@/lib/utils/currency';

export type InvoiceStatus = 'draft' | 'pending_approval' | 'sent' | 'viewed' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'disputed';

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

export interface InvoiceService {
  getForPayment(invoiceId: Uuid): Promise<InvoiceForPayment>;
  applyPayment(input: { invoiceId: Uuid; paymentId: Uuid; amount: Money }): Promise<{ status: InvoiceStatus }>;
  markDisputed(invoiceId: Uuid): Promise<void>;
  snapshot(invoiceId: Uuid): Promise<{ fileId: Uuid; contentHash: string }>;
}
