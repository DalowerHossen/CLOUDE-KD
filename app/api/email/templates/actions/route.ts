// path: app/api/email/templates/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { runTemplateAction, templateActionSchema } from '@/services/email/template-admin';

export const POST = withApi(
  {
    id: 'email.templates.action',
    scope: 'tenant',
    permission: { action: 'email.settings.manage', resourceType: 'email' },
    stepUp: { maxAgeSeconds: 300 },
    body: templateActionSchema,
    auditExempt: 'The template service writes the audit entry (previews change nothing).',
  },
  async ({ actor, tenant, body }) => {
    if (!actor || !tenant) throw new Error('unreachable');
    return { data: await runTemplateAction(actor, tenant.companyId, body) };
  },
);
