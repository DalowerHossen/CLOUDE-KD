// path: app/api/integrations/bank/connections/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { BANKFEED_STEP_UP_SECONDS } from '@/config/s16-bankfeed';
import { ForbiddenError } from '@/lib/errors';
import { bankUpdate } from '@/lib/integrations/bank-rules';
import { disconnect, getConnection, updateConnection } from '@/services/bankfeed/connections';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'bankfeed.connections.get',
    scope: 'tenant',
    permission: { action: 'bankfeed.read', resourceType: 'bank_feed_connection' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getConnection(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'bankfeed.connections.update',
    scope: 'tenant',
    permission: { action: 'bankfeed.manage', resourceType: 'bank_feed_connection' },
    params,
    body: bankUpdate,
    stepUp: { maxAgeSeconds: BANKFEED_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateConnection(actor, p.id, body) };
  },
);

/** Disconnects the link (Plaid: the Item is removed at Plaid). Lines that were imported stay in the books. */
export const DELETE = withApi(
  {
    id: 'bankfeed.connections.disconnect',
    scope: 'tenant',
    permission: { action: 'bankfeed.manage', resourceType: 'bank_feed_connection' },
    params,
    stepUp: { maxAgeSeconds: BANKFEED_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await disconnect(actor, p.id) };
  },
);
