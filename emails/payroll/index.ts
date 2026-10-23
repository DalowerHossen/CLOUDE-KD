// path: emails/payroll/index.ts
// Template catalogue of the payroll messages (STEP 15). The ids start with "payroll.". The messages are about the person's own
// pay and carry no amounts. One line in `emails/catalog.ts` adds this list (request R9).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { PayNoticeEmail } from './pay-notice';
import { PortalLinkEmail } from './portal-link';

export interface PayrollEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const payrollEmailTemplates: readonly PayrollEmailTemplate[] = [
  {
    definition: {
      id: 'payroll.pay-notice',
      subject: 'Your pay was sent',
      variables: ['firstName', 'companyName', 'periodStart', 'periodEnd', 'paidOn'],
    },
    component: PayNoticeEmail as unknown as ComponentType<never>,
  },
  {
    definition: {
      id: 'payroll.portal-link',
      subject: 'Your payslips',
      variables: ['firstName', 'companyName', 'link', 'expiresAt'],
    },
    component: PortalLinkEmail as unknown as ComponentType<never>,
  },
];
