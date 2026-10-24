// path: app/api/hr/leave/balances/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { balanceInput } from '@/services/hr/hr-rules';
import { listBalances, setBalance } from '@/services/hr/leave';

export const GET = withApi(
  {
    id: 'hr.leave.balances',
    scope: 'tenant',
    permission: { action: 'hr.read', resourceType: 'leave' },
    query: z.strictObject({
      employeeId: z.string().uuid().optional(),
      year: z.coerce.number().int().min(2000).max(2200).optional(),
    }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listBalances(actor.companyId, {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.year ? { year: query.year } : {}),
      }),
    };
  },
);

export const PUT = withApi(
  {
    id: 'hr.leave.balance_set',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'leave' },
    body: balanceInput,
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setBalance(actor, body) };
  },
);
