// path: app/api/integrations/commerce/connections/[id]/mappings/[mappingId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeMapping } from '@/services/integration/commerce-mappings';

export const DELETE = withApi(
  {
    id: 'commerce.mappings.remove',
    scope: 'tenant',
    permission: { action: 'commerce.sync', resourceType: 'integration_mapping' },
    params: z.object({ id: z.string().uuid(), mappingId: z.string().uuid() }).strict(),
    auditExempt: 'The mapping service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeMapping(actor, params.id, params.mappingId);
    return { data: { ok: true } };
  },
);
