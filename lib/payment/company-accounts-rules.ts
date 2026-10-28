// path: lib/payment/company-accounts-rules.ts
// Shapes of a company's own merchant account at a processor. Safe to import in the browser.
import { z } from 'zod';

export const saveAccountInput = z
  .object({
    companyId: z.string().uuid(),
    processorId: z.string().regex(/^[a-z]{2,20}$/),
    environment: z.enum(['sandbox', 'live']),
    /** Values of the credential fields of the processor's adapter; empty values are left out. */
    values: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,40}$/), z.string().max(4000)),
    merchantReference: z.string().trim().max(60).optional(),
    applicationId: z.string().uuid().optional(),
  })
  .strict();

export const accountActionInput = z
  .object({ action: z.enum(['test', 'enable', 'disable', 'remove']) })
  .strict();

export interface AccountView {
  id: string;
  companyId: string;
  companyName: string;
  processorId: string;
  environment: 'sandbox' | 'live';
  status: 'active' | 'disabled';
  merchantReference: string | null;
  fields: {
    key: string;
    label: string;
    secret: boolean;
    saved: boolean;
    required: boolean;
    helpText: string | null;
    display: string | null;
  }[];
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  version: number;
}

/**
 * Processors whose company account holds only a few fields: the rest (the platform's own keys) stays the platform's and is
 * used with them. For Stripe (Connect, direct charges) the company account is the connected account id; every call is made
 * with the platform's keys and the header Stripe-Account.
 */
export const COMPANY_ACCOUNT_OVERLAY: Readonly<Record<string, readonly string[]>> = {
  stripe: ['connectedAccountId'],
};

export const stripeConnectInput = z
  .object({
    companyId: z.string().uuid(),
    email: z.string().trim().email().max(200),
    displayName: z.string().trim().min(1).max(100),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/),
  })
  .strict();
