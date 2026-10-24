// path: app/api/integrations/gateway/sub-merchants/[id]/keys/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { GATEWAY_STEP_UP_SECONDS } from '@/config/s16-gateway';
import { ForbiddenError } from '@/lib/errors';
import { keyInput } from '@/lib/gateway/rules';
import { createSubKey, listSubKeys } from '@/services/gateway/keys';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'gateway.keys.list',
    scope: 'tenant',
    permission: { action: 'gateway.read', resourceType: 'sub_merchant_key' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listSubKeys(actor.companyId, p.id) };
  },
);

/** Makes a key for the sub-merchant. The secret is in the answer once. */
export const POST = withApi(
  {
    id: 'gateway.keys.create',
    scope: 'tenant',
    permission: { action: 'gateway.manage', resourceType: 'sub_merchant_key' },
    params,
    body: keyInput,
    stepUp: { maxAgeSeconds: GATEWAY_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createSubKey(actor, p.id, body) };
  },
);
