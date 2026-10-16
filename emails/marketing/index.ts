// path: emails/marketing/index.ts
// Template catalogue of STEP 06 (contact form; campaign templates are added in 06.8).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { ContactAckEmail } from './contact-ack';
import { ContactReceivedEmail } from './contact-received';

export interface MarketingEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const marketingEmailTemplates: readonly MarketingEmailTemplate[] = [
  {
    definition: {
      id: 'system.contact-received',
      subject: 'New contact message',
      variables: ['name', 'email', 'topic', 'message'],
    },
    component: ContactReceivedEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'system.contact-ack',
      subject: 'We received your message',
      variables: ['name'],
    },
    component: ContactAckEmail as ComponentType<never>,
  },
];
