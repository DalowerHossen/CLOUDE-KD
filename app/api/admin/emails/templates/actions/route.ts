// path: app/api/admin/emails/templates/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { runTemplateAction, templateActionSchema } from '@/services/email/template-admin';

export const POST = withApi(
  {
    id: 'admin.email.templates.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'email.template.manage', resourceType: 'email' },
    stepUp: { maxAgeSeconds: 300 },
    body: templateActionSchema,
    auditExempt: 'The template service writes the audit entry (previews change nothing).',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runTemplateAction(actor, null, body) };
  },
);
