// path: emails/onboarding/index.ts
// Template catalogue of STEP 07. The ids start with "notification." so every message carries the unsubscribe header.
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { InvitationEmail } from './invitation';
import { Day14Email, Day1Email, Day3Email, Day7Email } from './guidance';

export interface OnboardingEmailTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

const make = (
  day: number,
  subject: string,
  component: ComponentType<never>,
): OnboardingEmailTemplate => ({
  definition: { id: `notification.onboarding-day-${day}`, subject, variables: ['name'] },
  component,
});

export const onboardingEmailTemplates: readonly OnboardingEmailTemplate[] = [
  make(1, 'Finish setting up your workspace', Day1Email as ComponentType<never>),
  make(3, 'Add your first client', Day3Email as ComponentType<never>),
  make(7, 'Invite your team and protect your account', Day7Email as ComponentType<never>),
  make(14, 'Verify your business', Day14Email as ComponentType<never>),
  {
    definition: {
      id: 'auth.team-invitation',
      subject: 'You are invited to join {companyName}',
      variables: ['inviterName', 'companyName', 'acceptUrl', 'expiresOn'],
    },
    component: InvitationEmail as ComponentType<never>,
  },
];
