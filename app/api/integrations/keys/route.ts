// path: app/api/integrations/keys/route.ts
import { withApi } from '@/lib/api/with-api';
import { API_KEY_STEP_UP_SECONDS } from '@/config/s16-api';
import { ForbiddenError } from '@/lib/errors';
import { keyInput } from '@/lib/integrations/api-key-rules';
import { createKey, listKeys } from '@/services/publicapi/keys';

export const GET = withApi(
  {
    id: 'integrations.keys.list',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.read', resourceType: 'api_key' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listKeys(actor.companyId) };
  },
);

/**
 * Makes a key. The secret is in this one answer only. The route is not idempotent on purpose: a stored replay would keep the
 * secret in the idempotency store. A second submit makes a second key, which the owner can revoke.
 */
export const POST = withApi(
  {
    id: 'integrations.keys.create',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.manage', resourceType: 'api_key' },
    body: keyInput,
    stepUp: { maxAgeSeconds: API_KEY_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createKey(actor, body) };
  },
);
