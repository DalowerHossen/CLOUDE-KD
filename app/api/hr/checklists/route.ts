// path: app/api/hr/checklists/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createChecklist, listChecklists } from '@/services/hr/checklists';
import { checklistInput } from '@/services/hr/hr-rules';

export const GET = withApi(
  {
    id: 'hr.checklists.list',
    scope: 'tenant',
    permission: { action: 'hr.read', resourceType: 'checklist' },
    query: z.strictObject({
      employeeId: z.string().uuid().optional(),
      open: z.enum(['true', 'false']).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listChecklists(actor.companyId, {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.open === 'true' ? { open: true } : {}),
      }),
    };
  },
);

export const POST = withApi(
  {
    id: 'hr.checklists.create',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'checklist' },
    body: checklistInput,
    auditExempt: 'The checklist service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createChecklist(actor, body) };
  },
);
