// path: app/api/hr/departments/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { departmentUpdate } from '@/services/hr/hr-rules';
import { removeDepartment, updateDepartment } from '@/services/hr/org';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'hr.departments.update',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'department' },
    params,
    body: departmentUpdate,
    auditExempt: 'The organisation service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateDepartment(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'hr.departments.remove',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'department' },
    params,
    auditExempt: 'The organisation service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeDepartment(actor, p.id);
    return { data: { ok: true } };
  },
);
