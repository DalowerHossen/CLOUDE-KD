// path: app/api/integrations/settlement/ingest-keys/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SETTLEMENT_STEP_UP_SECONDS } from '@/config/s16-settlement';
import { ForbiddenError } from '@/lib/errors';
import { revokeIngestKey } from '@/services/gateway/ingest-keys';

const params = z.object({ id: z.string().uuid() }).strict();

/** Revokes a key at once (use this when a key leaks). */
export const DELETE = withApi(
  {
    id: 'settlement.ingestKeys.revoke',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_ingest_key' },
    params,
    stepUp: { maxAgeSeconds: SETTLEMENT_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await revokeIngestKey(actor, p.id);
    return { data: { revoked: true } };
  },
);
