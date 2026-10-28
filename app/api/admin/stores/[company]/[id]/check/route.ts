// path: app/api/admin/stores/[company]/[id]/check/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { checkStoreFor } from '@/services/integration/admin-stores';

export const POST = withApi(
  {
    id: 'admin.stores.check',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'commerce.admin', resourceType: 'integration' },
    params: z.object({ company: z.string().uuid(), id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),

    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await checkStoreFor(actor, params.company, params.id) };
  },
);
