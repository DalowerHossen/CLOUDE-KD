// path: app/api/hr/employees/[id]/assign/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { assignInput } from '@/services/hr/hr-rules';
import { assignEmployee } from '@/services/hr/org';

export const PUT = withApi(
  {
    id: 'hr.employees.assign',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'department' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: assignInput,
    auditExempt: 'The organisation service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await assignEmployee(actor, params.id, body);
    return { data: { ok: true } };
  },
);
