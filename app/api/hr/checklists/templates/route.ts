// path: app/api/hr/checklists/templates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createTemplate, listTemplates } from '@/services/hr/checklists';
import { templateInput } from '@/services/hr/hr-rules';

export const GET = withApi(
  {
    id: 'hr.templates.list',
    scope: 'tenant',
    permission: { action: 'hr.read', resourceType: 'checklist' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listTemplates(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'hr.templates.create',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'checklist' },
    body: templateInput,
    auditExempt: 'The checklist service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createTemplate(actor, body) };
  },
);
