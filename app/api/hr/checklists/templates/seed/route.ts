// path: app/api/hr/checklists/templates/seed/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ensureTemplates } from '@/services/hr/checklists';

export const POST = withApi(
  {
    id: 'hr.templates.seed',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'checklist' },
    auditExempt: 'The checklist service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { made: await ensureTemplates(actor) } };
  },
);
