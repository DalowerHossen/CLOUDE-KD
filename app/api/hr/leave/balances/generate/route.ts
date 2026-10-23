// path: app/api/hr/leave/balances/generate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { generateBalances } from '@/services/hr/leave';

export const POST = withApi(
  {
    id: 'hr.leave.balances_generate',
    scope: 'tenant',
    permission: { action: 'hr.manage', resourceType: 'leave' },
    body: z.strictObject({ year: z.number().int().min(2000).max(2200) }),
    idempotent: true,
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await generateBalances(actor, body.year) };
  },
);
