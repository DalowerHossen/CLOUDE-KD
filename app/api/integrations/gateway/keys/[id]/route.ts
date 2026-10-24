// path: app/api/integrations/gateway/keys/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { GATEWAY_STEP_UP_SECONDS } from '@/config/s16-gateway';
import { ForbiddenError } from '@/lib/errors';
import { revokeSubKey } from '@/services/gateway/keys';

const params = z.object({ id: z.string().uuid() }).strict();

/** Revokes a key at once. */
export const DELETE = withApi(
  {
    id: 'gateway.keys.revoke',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'sub_merchant_key' },
    params,
    stepUp: { maxAgeSeconds: GATEWAY_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await revokeSubKey(actor, p.id);
    return { data: { revoked: true } };
  },
);
