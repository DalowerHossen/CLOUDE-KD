// path: app/api/hr/positions/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removePosition } from '@/services/hr/org';

export const DELETE = withApi(
  {
    id: 'hr.positions.remove',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'department' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The organisation service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removePosition(actor, params.id);
    return { data: { ok: true } };
  },
);
