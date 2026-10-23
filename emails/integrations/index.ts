// path: emails/integrations/index.ts
// Template catalogue of the integration messages (STEP 16). The ids start with "integrations.". One line in `emails/catalog.ts`
// adds this list (request R6 of STEP 16); until then the e-mail channel of messaging reports that the template does not exist.
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { BroadcastEmail } from './broadcast';

export interface IntegrationEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const integrationEmailTemplates: readonly IntegrationEmailTemplate[] = [
  {
    definition: {
      id: 'integrations.broadcast',
      subject: '{subject}',
      variables: ['subject', 'body'],
    },
    component: BroadcastEmail as unknown as ComponentType<never>,
  },
];
