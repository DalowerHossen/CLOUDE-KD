// path: app/api/contracts/[id]/send/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { sendSchema } from '@/services/contract/schemas';
import { sendContract } from '@/services/contract/send';

const params = z.object({ id: z.string().uuid() }).strict();

/** Freezes the wording, stores its hash and invites the signers. */
export const POST = withApi(
  {
    id: 'contracts.send',
    scope: 'tenant',
    permission: { action: 'contract.send', resourceType: 'contract' },
    rateLimitPolicy: 'strict',
    params,
    body: sendSchema,
    auditExempt: 'The database audit trigger and the contract event log record the change.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await sendContract(actor, p.id, body.message) };
  },
);
