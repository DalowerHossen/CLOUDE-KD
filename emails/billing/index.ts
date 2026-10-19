// path: emails/billing/index.ts
// Template catalogue of the wallet and billing messages (STEP 14). The ids start with "billing." and the messages
// are about the owner's own account, so they carry no unsubscribe header.
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { PayoutFailedEmail } from './payout-failed';
import { PayoutPaidEmail } from './payout-paid';
import {
  DowngradedEmail,
  PaymentFailedEmail,
  RenewalReminderEmail,
  SubscriptionInvoiceEmail,
  SubscriptionReceiptEmail,
  TrialEndingEmail,
} from './subscription-emails';

export interface BillingEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

const entry = (
  id: string,
  subject: string,
  variables: readonly string[],
  component: unknown,
): BillingEmailTemplate => ({
  definition: { id, subject, variables },
  component: component as ComponentType<never>,
});

export const billingEmailTemplates: readonly BillingEmailTemplate[] = [
  entry(
    'billing.payout-paid',
    'Your payout was sent',
    ['companyName', 'amount', 'reference', 'link'],
    PayoutPaidEmail,
  ),
  entry(
    'billing.payout-failed',
    'A payout failed',
    ['companyName', 'amount', 'reason', 'link'],
    PayoutFailedEmail,
  ),
  entry(
    'billing.invoice',
    'Invoice {number}',
    ['companyName', 'number', 'total', 'dueDate', 'description', 'link'],
    SubscriptionInvoiceEmail,
  ),
  entry(
    'billing.receipt',
    'Receipt for invoice {number}',
    ['companyName', 'number', 'total', 'paidAt', 'link'],
    SubscriptionReceiptEmail,
  ),
  entry(
    'billing.renewal-reminder',
    'Your {planName} plan renews in {daysLeft} days',
    ['companyName', 'planName', 'renewsOn', 'total', 'daysLeft', 'link'],
    RenewalReminderEmail,
  ),
  entry(
    'billing.payment-failed',
    'Payment needed for invoice {number}',
    ['companyName', 'number', 'total', 'attempt', 'graceEnds', 'link'],
    PaymentFailedEmail,
  ),
  entry(
    'billing.downgraded',
    'Your company moved to the free plan',
    ['companyName', 'planName', 'reason', 'link'],
    DowngradedEmail,
  ),
  entry(
    'billing.trial-ending',
    'Your {planName} trial ends on {endsOn}',
    ['companyName', 'planName', 'endsOn', 'link'],
    TrialEndingEmail,
  ),
];
