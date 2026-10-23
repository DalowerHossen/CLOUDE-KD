// path: app/api/integrations/bank/connections/[id]/accounts/[accountId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { BANKFEED_STEP_UP_SECONDS } from '@/config/s16-bankfeed';
import { ForbiddenError } from '@/lib/errors';
import { accountMap } from '@/lib/integrations/bank-rules';
import { mapAccount } from '@/services/bankfeed/connections';

/** Maps an account of the bank to a bank account of the books (null removes the mapping). */
export const PUT = withApi(
  {
    id: 'bankfeed.accounts.map',
    scope: 'tenant',
    permission: { action: 'bankfeed.manage', resourceType: 'bank_feed_account' },
    params: z.object({ id: z.string().uuid(), accountId: z.string().uuid() }).strict(),
    body: accountMap,
    stepUp: { maxAgeSeconds: BANKFEED_STEP_UP_SECONDS },
    auditExempt: 'The connection service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await mapAccount(actor, params.id, params.accountId, body) };
  },
);
