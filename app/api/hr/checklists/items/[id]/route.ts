// path: app/api/hr/checklists/items/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { tickItem } from '@/services/hr/checklists';
import { tickInput } from '@/services/hr/hr-rules';

export const PUT = withApi(
  {
    id: 'hr.checklists.tick',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'checklist' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: tickInput,
    auditExempt: 'The checklist service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await tickItem(actor, params.id, body);
    return { data: { ok: true } };
  },
);
