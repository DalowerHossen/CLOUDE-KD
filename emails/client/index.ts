// path: emails/client/index.ts
// Template catalogue of the client portal messages (STEP 13). Invoice, estimate, overdue reminder and statement
// messages already exist in `emails/invoice` and `emails/crm`; these are the others. The ids start with "client." so
// open and click tracking stays on (it feeds the delivery proof) and no unsubscribe header is added (they are documents).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { ContractReminderEmail } from './contract-reminder';
import { ContractSentEmail } from './contract-sent';
import { CreditNoteEmail } from './credit-note';
import { EstimateExpiredEmail } from './estimate-expired';
import { EstimateReminderEmail } from './estimate-reminder';
import { FinalNoticeEmail } from './final-notice';
import { NewLinkEmail } from './new-link';
import { ProformaEmail } from './proforma';
import { ReceiptEmail } from './receipt';
import { RefundEmail } from './refund';
import { ThankYouEmail } from './thank-you';

export interface ClientEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

const entry = (
  id: string,
  subject: string,
  variables: readonly string[],
  component: unknown,
): ClientEmailTemplate => ({
  definition: { id, subject, variables },
  component: component as ComponentType<never>,
});

export const clientEmailTemplates: readonly ClientEmailTemplate[] = [
  entry(
    'client.receipt',
    'Receipt {reference} from {companyName}',
    ['clientName', 'companyName', 'reference', 'amount', 'paidAt', 'invoiceNumber', 'link'],
    ReceiptEmail,
  ),
  entry(
    'client.refund',
    'Refund from {companyName}',
    ['clientName', 'companyName', 'reference', 'amount', 'invoiceNumber', 'refundedAt'],
    RefundEmail,
  ),
  entry(
    'client.estimate-reminder',
    'Reminder: estimate {number} from {companyName}',
    ['clientName', 'companyName', 'number', 'total', 'validUntil', 'message', 'link'],
    EstimateReminderEmail,
  ),
  entry(
    'client.estimate-expired',
    'Estimate {number} has expired',
    ['clientName', 'companyName', 'number', 'validUntil', 'contactEmail'],
    EstimateExpiredEmail,
  ),
  entry(
    'client.final-notice',
    'Final notice: invoice {number}',
    [
      'clientName',
      'companyName',
      'number',
      'amountDue',
      'dueDate',
      'daysLate',
      'lateFee',
      'message',
      'link',
    ],
    FinalNoticeEmail,
  ),
  entry(
    'client.thank-you',
    'Thank you from {companyName}',
    ['clientName', 'companyName', 'invoiceNumber', 'amount'],
    ThankYouEmail,
  ),
  entry(
    'client.credit-note',
    'Credit note {number} from {companyName}',
    ['clientName', 'companyName', 'number', 'amount', 'invoiceNumber', 'link'],
    CreditNoteEmail,
  ),
  entry(
    'client.proforma',
    'Proforma invoice {number} from {companyName}',
    ['clientName', 'companyName', 'number', 'total', 'dueDate', 'message', 'link'],
    ProformaEmail,
  ),
  entry(
    'client.new-link',
    'Your new link from {companyName}',
    ['clientName', 'companyName', 'docLabel', 'expiresAt', 'link'],
    NewLinkEmail,
  ),
  entry(
    'client.contract-sent',
    '{companyName} asks you to sign {title}',
    ['clientName', 'companyName', 'title', 'number', 'signBy', 'message', 'link'],
    ContractSentEmail,
  ),
  entry(
    'client.contract-reminder',
    'Reminder: please sign {title}',
    ['clientName', 'companyName', 'title', 'number', 'signBy', 'message', 'link'],
    ContractReminderEmail,
  ),
];
