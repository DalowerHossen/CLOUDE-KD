// path: emails/security/index.ts
// Template catalogue of STEP 04. The e-mail service (STEP 05) registers the definitions and renders the components.
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { AlertEmail } from './alert';
import { TokenOtpEmail } from './token-otp';

export interface SecurityEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const securityEmailTemplates: readonly SecurityEmailTemplate[] = [
  {
    definition: { id: 'security.token-otp', subject: 'Your one-time code', variables: ['code'] },
    component: TokenOtpEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'security.alert',
      subject: 'Security alert',
      variables: ['severity', 'title', 'body'],
    },
    component: AlertEmail as ComponentType<never>,
  },
];
