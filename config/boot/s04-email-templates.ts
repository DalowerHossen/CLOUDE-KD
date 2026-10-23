// path: config/boot/s04-email-templates.ts
// Registers the security e-mail template definitions with the e-mail service once it exists (STEP 05).
import { tryGetService } from '@/lib/container';
import { securityEmailTemplates } from '@/emails/security';

export async function boot(): Promise<void> {
  const email = tryGetService('email');
  if (!email) return;
  for (const template of securityEmailTemplates) email.registerTemplate(template.definition);
}
