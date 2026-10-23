// path: app/api/integrations/keys/[id]/rotate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { API_KEY_STEP_UP_SECONDS } from '@/config/s16-api';
import { ForbiddenError } from '@/lib/errors';
import { rotateInput } from '@/lib/integrations/api-key-rules';
import { rotateKey } from '@/services/publicapi/keys';

/** Makes the replacement key (its secret is in this answer only) and lets the old key work for the overlap. Not idempotent, see the create route. */
export const POST = withApi(
  {
    id: 'integrations.keys.rotate',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.manage', resourceType: 'api_key' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: rotateInput,
    stepUp: { maxAgeSeconds: API_KEY_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await rotateKey(actor, params.id, body) };
  },
);
