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

export interface PaymentService {
  createPayment(input: CreatePaymentInput): Promise<PaymentSummary>;
  refund(paymentId: Uuid, amount: Money, reason: string | null, idempotencyKey: string): Promise<PaymentSummary>;
  getPayment(paymentId: Uuid): Promise<PaymentSummary>;
  listReview(): Promise<PaymentSummary[]>;
}
