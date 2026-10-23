// path: app/api/accounting/accounts/export/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { exportAccountsCsv } from '@/services/accounting/accounts';

export const GET = withApi(
  {
    id: 'accounting.accounts.export',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'account' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { csv: await exportAccountsCsv(actor.companyId) } };
  },
);
