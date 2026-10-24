// path: app/api/payroll/grades/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { gradeInput } from '@/services/payroll/payroll-rules';
import { createGrade } from '@/services/payroll/structures';

export const POST = withApi(
  {
    id: 'payroll.grades.create',
    scope: 'tenant',
    permission: { action: 'payroll.settings.manage', resourceType: 'salary_grade' },
    body: gradeInput,
    auditExempt: 'The structure service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createGrade(actor, body) };
  },
);
