// path: emails/shared/index.ts
// Template catalogue of STEP 05 (shared templates used by the platform itself).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { TestMessageEmail } from './test-message';

export interface SharedEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const sharedEmailTemplates: readonly SharedEmailTemplate[] = [
  {
    definition: { id: 'system.test', subject: 'Test message', variables: ['sentBy'] },
    component: TestMessageEmail as ComponentType<never>,
  },
];
