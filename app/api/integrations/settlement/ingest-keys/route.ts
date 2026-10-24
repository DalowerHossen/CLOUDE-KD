// path: app/api/integrations/settlement/ingest-keys/route.ts
import { withApi } from '@/lib/api/with-api';
import { SETTLEMENT_STEP_UP_SECONDS } from '@/config/s16-settlement';
import { ForbiddenError } from '@/lib/errors';
import { ingestKeyInput } from '@/lib/gateway/ingest-rules';
import { createIngestKey, listIngestKeys } from '@/services/gateway/ingest-keys';

export const GET = withApi(
  {
    id: 'settlement.ingestKeys.list',
    scope: 'tenant',
    permission: { action: 'settlement.read', resourceType: 'settlement_ingest_key' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listIngestKeys(actor.companyId) };
  },
);

/** Makes a key for the main merchant's app. The secret is in the answer once. */
export const POST = withApi(
  {
    id: 'settlement.ingestKeys.create',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_ingest_key' },
    body: ingestKeyInput,
    stepUp: { maxAgeSeconds: SETTLEMENT_STEP_UP_SECONDS },
    auditExempt: 'The key service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createIngestKey(actor, body) };
  },
);
