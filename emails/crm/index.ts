// path: emails/crm/index.ts
// Template catalogue of the client and purchasing screens (STEP 08). The ids start with "invoice." so a company can
// edit the wording, and the messages carry no unsubscribe header (they are documents, not newsletters).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { StatementEmail } from './statement';

export interface CrmEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const crmEmailTemplates: readonly CrmEmailTemplate[] = [
  {
    definition: {
      id: 'invoice.client-statement',
      subject: 'Your statement from {companyName}',
      variables: [
        'clientName',
        'companyName',
        'from',
        'to',
        'openingBalance',
        'balance',
        'current',
        'd1_30',
        'd31_60',
        'd61_90',
        'd91_plus',
        'lines',
      ],
    },
    component: StatementEmail as ComponentType<never>,
  },
];
