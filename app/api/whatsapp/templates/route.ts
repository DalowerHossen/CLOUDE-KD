// path: app/api/whatsapp/templates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { templateInput } from '@/lib/whatsapp/rules';
import { createTemplate, listTemplates } from '@/services/whatsapp/templates';

export const GET = withApi(
  {
    id: 'whatsapp.templates.list',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_template' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listTemplates(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'whatsapp.templates.create',
    scope: 'tenant',
    permission: { action: 'whatsapp.manage', resourceType: 'whatsapp_template' },
    body: templateInput,
    idempotent: true,
    auditExempt: 'The template service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createTemplate(actor, body) };
  },
);
