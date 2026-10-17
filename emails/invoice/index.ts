// path: emails/invoice/index.ts
// Template catalogue of the invoicing screens (STEP 09). The ids start with "invoice." so a company can edit the
// wording, and the messages carry no unsubscribe header (they are documents, not newsletters).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { EstimateSentEmail } from './estimate-sent';
import { InvoiceReminderEmail } from './invoice-reminder';
import { InvoiceSentEmail } from './invoice-sent';

export interface InvoiceEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const invoiceEmailTemplates: readonly InvoiceEmailTemplate[] = [
  {
    definition: {
      id: 'invoice.sent',
      subject: 'Invoice {number} from {companyName}',
      variables: ['clientName', 'companyName', 'number', 'amountDue', 'dueDate', 'message', 'link'],
    },
    component: InvoiceSentEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'estimate.sent',
      subject: 'Estimate {number} from {companyName}',
      variables: ['clientName', 'companyName', 'number', 'total', 'validUntil', 'message', 'link'],
    },
    component: EstimateSentEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'invoice.reminder',
      subject: 'Reminder: invoice {number} {stageText}',
      variables: [
        'clientName',
        'companyName',
        'number',
        'amountDue',
        'dueDate',
        'stageText',
        'daysLate',
        'message',
        'link',
      ],
    },
    component: InvoiceReminderEmail as ComponentType<never>,
  },
];
