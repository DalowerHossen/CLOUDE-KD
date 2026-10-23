// path: app/api/payroll/grades/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeGrade } from '@/services/payroll/structures';

export const DELETE = withApi(
  {
    id: 'payroll.grades.remove',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_grade' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeGrade(actor, params.id);
    return { data: { ok: true } };
  },
);
