// path: app/api/integrations/keys/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { API_KEY_STEP_UP_SECONDS } from '@/config/s16-api';
import { ForbiddenError } from '@/lib/errors';
import { keyUpdate } from '@/lib/integrations/api-key-rules';
import { getKey, revokeKey, updateKey } from '@/services/publicapi/keys';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'integrations.keys.get',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.read', resourceType: 'api_key' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getKey(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'integrations.keys.update',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.manage', resourceType: 'api_key' },
    params,
    body: keyUpdate,
    stepUp: { maxAgeSeconds: API_KEY_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateKey(actor, p.id, body) };
  },
);

/** Revokes the key. A revoked key stays revoked. */
export const DELETE = withApi(
  {
    id: 'integrations.keys.revoke',
    scope: 'tenant',
    permission: { action: 'integrations.apikey.manage', resourceType: 'api_key' },
    params,
    stepUp: { maxAgeSeconds: API_KEY_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await revokeKey(actor, p.id);
    return { data: { ok: true } };
  },
);
