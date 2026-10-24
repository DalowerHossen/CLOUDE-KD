// path: app/api/payroll/declarations/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listDeclarations } from '@/services/payroll/portal';

export const GET = withApi(
  {
    id: 'payroll.declarations.list',
    scope: 'tenant',
    permission: { action: 'payroll.portal.manage', resourceType: 'employee' },
    query: z.strictObject({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDeclarations(actor.companyId, query.status) };
  },
);
