// path: app/api/payroll/employees/import/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_IMPORT_BYTES } from '@/config/s15-accounting';
import { importEmployees } from '@/services/payroll/employees';

export const POST = withApi(
  {
    id: 'payroll.employees.import',
    scope: 'tenant',
    permission: { action: 'payroll.employee.manage', resourceType: 'employee' },
    body: z.strictObject({ csv: z.string().min(1).max(MAX_IMPORT_BYTES) }),
    maxBodyBytes: MAX_IMPORT_BYTES + 4096,
    auditExempt: 'The employee service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await importEmployees(actor, body.csv) };
  },
);
