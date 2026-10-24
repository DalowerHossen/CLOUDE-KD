// path: app/api/integrations/keys/[id]/usage/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getKey } from '@/services/publicapi/keys';
import { usageOfKey } from '@/services/publicapi/usage';

export const GET = withApi(
  {
    id: 'integrations.keys.usage',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.read', resourceType: 'api_key' },
    params: z.object({ id: z.string().uuid() }).strict(),
    query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).strict(),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await getKey(actor.companyId, params.id);
    return { data: await usageOfKey(actor.companyId, params.id, query.days) };
  },
);
