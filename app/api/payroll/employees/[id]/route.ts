// path: app/api/payroll/employees/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { archiveEmployee, getEmployee, updateEmployee } from '@/services/payroll/employees';
import { employeeUpdate } from '@/services/payroll/payroll-rules';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'payroll.employees.get',
    scope: 'tenant',
    permission: { action: 'payroll.employee.read', resourceType: 'employee' },
    params,
    auditExempt: 'The employee service writes an audit entry for every view.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getEmployee(actor, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'payroll.employees.update',
    scope: 'tenant',
    permission: { action: 'payroll.employee.manage', resourceType: 'employee' },
    params,
    body: employeeUpdate,
    auditExempt: 'The employee service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateEmployee(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'payroll.employees.archive',
    scope: 'tenant',
    permission: { action: 'payroll.employee.manage', resourceType: 'employee' },
    params,
    auditExempt: 'The employee service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await archiveEmployee(actor, p.id);
    return { data: { ok: true } };
  },
);
