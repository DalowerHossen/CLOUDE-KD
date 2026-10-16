// path: emails/catalog.ts
// Every e-mail template component of the platform. The e-mail service registers this list at start-up.
// A STEP that adds `emails/<name>/index.ts` with a catalogue adds one line here (see DEPENDENCY_REQUESTS of STEP 05).
import type { ComponentType } from 'react';
import type { EmailTemplateDefinition } from '@/types/contracts';
import { authEmailTemplates } from './auth';
import { securityEmailTemplates } from './security';

export interface CatalogTemplate {
  definition: EmailTemplateDefinition;
  component: ComponentType<never>;
}

export const emailCatalog: readonly CatalogTemplate[] = [
  ...authEmailTemplates,
  ...securityEmailTemplates,
];
