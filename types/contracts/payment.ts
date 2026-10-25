// path: types/contracts/payment.ts
import type { Uuid } from './common';
import type { Money } from '@/lib/utils/currency';
import type { ProcessorId } from './payment-adapter';

export type PaymentStatus =
  | 'created'
  | 'requires_action'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'pending_review'
  | 'voided'
  | 'partially_refunded'
  | 'refunded';

export interface PaymentSummary {
  id: Uuid;
  invoiceId: Uuid;
  companyId: Uuid;
  processorId: ProcessorId;
  status: PaymentStatus;
  amount: Money;
  failureReason: string | null;
  createdAt: string;
}

export interface CreatePaymentInput {
  invoiceId: Uuid;
  idempotencyKey: string;
  paymentToken: string;
  billingPostalCode: string | null;
  payerIp: string;
  returnUrl: string;
}

export interface OrderPaymentLink {
  linkId: Uuid;
  /** The address of the hosted payment page the buyer is sent to. */
  url: string;
  expiresAt: string;
}

export interface PaymentService {
  /** A payment link for an invoice of the company, made on behalf of a person (no session needed). */
  createLink(input: {
    companyId: Uuid;
    invoiceId: Uuid;
    createdBy: Uuid;
    validHours: number | null;
  }): Promise<OrderPaymentLink>;
  /** Stops a payment link from working. Safe to call for a link that is already stopped. */
  revokeLink(input: { companyId: Uuid; linkId: Uuid }): Promise<void>;
  createPayment(input: CreatePaymentInput): Promise<PaymentSummary>;
  refund(
    paymentId: Uuid,
    amount: Money,
    reason: string | null,
    idempotencyKey: string,
  ): Promise<PaymentSummary>;
  getPayment(paymentId: Uuid): Promise<PaymentSummary>;
  listReview(): Promise<PaymentSummary[]>;
}
