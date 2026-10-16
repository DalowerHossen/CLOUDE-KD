// path: config/boot/s03-email-templates.ts
// Registers the auth e-mail template definitions with the e-mail service once it exists (STEP 05).
import { tryGetService } from '@/lib/container';
import { authEmailTemplates } from '@/emails/auth';

export async function boot(): Promise<void> {
  const email = tryGetService('email');
  if (!email) return;
  for (const template of authEmailTemplates) email.registerTemplate(template.definition);
}
