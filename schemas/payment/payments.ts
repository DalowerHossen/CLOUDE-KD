// path: schemas/payment/payments.ts
import { z } from 'zod';

/** A return address must be an http(s) address; the service also checks that it belongs to this application. */
const returnUrl = z
  .string()
  .url()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'The return address must start with https://');

export const idempotencyKey = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

/** Input of the `payments` contract. The amount is never part of it: it comes from the invoice. */
export const createPaymentSchema = z
  .object({
    invoiceId: z.string().uuid(),
    idempotencyKey,
    /** Single-use token created by the processor's own secure form. */
    paymentToken: z.string().min(4).max(4000),
    billingPostalCode: z.string().trim().max(20).nullable(),
    payerIp: z.string().min(3).max(64),
    returnUrl,
  })
  .strict();

/** Body of POST /api/payments (the payer's address and the idempotency key come from the request itself). */
export const createPaymentBodySchema = z
  .object({
    invoiceId: z.string().uuid(),
    paymentToken: z.string().min(4).max(4000),
    billingPostalCode: z.string().trim().max(20).nullable().default(null),
    returnUrl,
  })
  .strict();

export const refundBodySchema = z
  .object({
    paymentId: z.string().uuid(),
    amount: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/),
    reason: z.string().trim().max(300).nullable().default(null),
  })
  .strict();

export const refundDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(300).nullable().default(null),
  })
  .strict();

export const paymentListQuery = z
  .object({
    status: z
      .enum([
        'created',
        'requires_action',
        'authorized',
        'captured',
        'failed',
        'pending_review',
        'voided',
        'partially_refunded',
        'refunded',
      ])
      .optional(),
    invoiceId: z.string().uuid().optional(),
    limit: z
      .string()
      .regex(/^\d{1,3}$/)
      .optional(),
  })
  .strict();

export const linkCreateSchema = z
  .object({
    invoiceId: z.string().uuid(),
    amount: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .nullable()
      .default(null),
    validHours: z.number().int().min(1).max(720).nullable().default(null),
  })
  .strict();

export const tokenParam = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/) }).strict();

export const linkPayBodySchema = z
  .object({
    paymentToken: z.string().min(4).max(4000),
    billingPostalCode: z.string().trim().max(20).nullable().default(null),
    returnUrl,
  })
  .strict();

export const linkResumeBodySchema = z.object({ paymentId: z.string().uuid() }).strict();
