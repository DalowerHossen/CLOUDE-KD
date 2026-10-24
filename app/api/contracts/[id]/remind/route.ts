// path: app/api/contracts/[id]/remind/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { remindSigners } from '@/services/contract/send';

const params = z.object({ id: z.string().uuid() }).strict();

/** Sends a new link to every signer who has not signed (at most once a day for each). */
export const POST = withApi(
  {
    id: 'contracts.remind',
    scope: 'tenant',
    permission: { action: 'contract.send', resourceType: 'contract' },
    rateLimitPolicy: 'strict',
    params,
    auditExempt: 'The contract event log records every reminder.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { reminded: await remindSigners(actor, actor.companyId, p.id) } };
  },
);
