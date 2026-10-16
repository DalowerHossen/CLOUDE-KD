// path: emails/marketing/index.ts
// Template catalogue of STEP 06 (contact form; welcome series and campaigns)).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { CampaignEmail } from './campaign';
import { ContactAckEmail } from './contact-ack';
import { ContactReceivedEmail } from './contact-received';
import { DripThreeEmail, DripTwoEmail, WelcomeEmail } from './welcome';

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
  {
    definition: {
      id: 'marketing.welcome',
      subject: 'Welcome to KD SOLUTION IT',
      variables: ['name'],
    },
    component: WelcomeEmail as ComponentType<never>,
  },
  {
    definition: { id: 'marketing.drip-2', subject: 'How to get paid faster', variables: ['name'] },
    component: DripTwoEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'marketing.drip-3',
      subject: 'Ready to try KD SOLUTION IT?',
      variables: ['name'],
    },
    component: DripThreeEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'marketing.campaign',
      subject: '{subject}',
      variables: ['subject', 'bodyText', 'name'],
    },
    component: CampaignEmail as ComponentType<never>,
  },
];
