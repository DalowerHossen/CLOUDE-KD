// path: app/api/integrations/commerce/connections/[id]/mappings/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { mappingInput } from '@/lib/integrations/mapping-rules';
import { listMappings, putMapping } from '@/services/integration/commerce-mappings';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'commerce.mappings.list',
    scope: 'tenant',
    permission: { action: 'commerce.read', resourceType: 'integration_mapping' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listMappings(actor.companyId, p.id) };
  },
);

/** Maps a store SKU to a product (a SKU that is mapped already gets the new product). */
export const PUT = withApi(
  {
    id: 'commerce.mappings.put',
    scope: 'tenant',
    permission: { action: 'commerce.sync', resourceType: 'integration_mapping' },
    params,
    body: mappingInput,
    idempotent: true,
    auditExempt: 'The mapping service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await putMapping(actor, p.id, body) };
  },
);
