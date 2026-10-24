// path: app/api/payroll/employees/[id]/pay/route.ts
// Changes one group of the encrypted details of an employee: pay, bank account or tax identity. The body is flat (the fields of
// the group and the version), so a plain form can send it.
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { updateEmployee } from '@/services/payroll/employees';
import { bankInfo, payInfo, taxInfo } from '@/services/payroll/payroll-rules';

const version = { version: z.number().int().min(1) };
const body = z.union([
  payInfo.extend({ group: z.literal('pay'), ...version }).strict(),
  bankInfo.extend({ group: z.literal('bank'), ...version }).strict(),
  taxInfo.extend({ group: z.literal('tax'), ...version }).strict(),
]);

export const PUT = withApi(
  {
    id: 'payroll.employees.pay_set',
    scope: 'tenant',
    permission: { action: 'payroll.pay.manage', resourceType: 'employee' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body,
    stepUp: { maxAgeSeconds: 900 },
    auditExempt: 'The employee service writes the audit entry.',
  },
  async ({ actor, params, body: b }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const { group, version: v, ...rest } = b;
    return { data: await updateEmployee(actor, params.id, { version: v, [group]: rest }) };
  },
);
