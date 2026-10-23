// path: app/api/payroll/employees/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createEmployee, listEmployees } from '@/services/payroll/employees';
import { employeeInput } from '@/services/payroll/payroll-rules';

export const GET = withApi(
  {
    id: 'payroll.employees.list',
    scope: 'tenant',
    permission: { action: 'payroll.employee.read', resourceType: 'employee' },
    query: z.strictObject({
      status: z.enum(['active', 'on_leave', 'terminated']).optional(),
      department: z.string().trim().max(80).optional(),
      search: z.string().trim().max(80).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEmployees(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'payroll.employees.create',
    scope: 'tenant',
    permission: { action: 'payroll.employee.manage', resourceType: 'employee' },
    body: employeeInput,
    idempotent: true,
    auditExempt: 'The employee service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createEmployee(actor, body) };
  },
);
