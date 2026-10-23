// path: app/api/integrations/bank/connections/route.ts
import { withApi } from '@/lib/api/with-api';
import { BANKFEED_STEP_UP_SECONDS } from '@/config/s16-bankfeed';
import { ForbiddenError } from '@/lib/errors';
import { bankConnect } from '@/lib/integrations/bank-rules';
import { connectBank, listConnections } from '@/services/bankfeed/connections';

export const GET = withApi(
  {
    id: 'bankfeed.connections.list',
    scope: 'tenant',
    permission: { action: 'bankfeed.read', resourceType: 'bank_feed_connection' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listConnections(actor.companyId) };
  },
);

/** Saves the keys of the company's Plaid or Salt Edge account. The keys are sealed at once and never returned. */
export const POST = withApi(
  {
    id: 'bankfeed.connections.connect',
    scope: 'tenant',
    permission: { action: 'bankfeed.manage', resourceType: 'bank_feed_connection' },
    body: bankConnect,
    stepUp: { maxAgeSeconds: BANKFEED_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await connectBank(actor, body) };
  },
);
