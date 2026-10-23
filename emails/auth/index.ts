// path: emails/auth/index.ts
// Template catalogue of STEP 03. The e-mail service (STEP 05) registers the definitions and renders the components.
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { AccountLockedEmail } from './account-locked';
import { NewDeviceEmail } from './new-device';
import { PasswordChangedEmail } from './password-changed';
import { ResetPasswordEmail } from './reset-password';
import { UnlockConfirmationEmail } from './unlock-confirmation';
import { VerifyEmail } from './verify-email';

export interface AuthEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const authEmailTemplates: readonly AuthEmailTemplate[] = [
  {
    definition: {
      id: 'auth.account-locked',
      subject: 'Sign-in to your account was locked',
      variables: ['audience', 'lockedUntil'],
    },
    component: AccountLockedEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'auth.verify-email',
      subject: 'Confirm your e-mail address',
      variables: ['verifyUrl'],
    },
    component: VerifyEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'auth.reset-password',
      subject: 'Reset your password',
      variables: ['resetUrl'],
    },
    component: ResetPasswordEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'auth.unlock-confirmation',
      subject: 'Confirm that your account may be unlocked',
      variables: ['confirmUrl'],
    },
    component: UnlockConfirmationEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'auth.new-device',
      subject: 'New sign-in to your account',
      variables: ['device', 'network', 'time'],
    },
    component: NewDeviceEmail as ComponentType<never>,
  },
  {
    definition: {
      id: 'auth.password-changed',
      subject: 'Your password was changed',
      variables: ['time'],
    },
    component: PasswordChangedEmail as ComponentType<never>,
  },
];
