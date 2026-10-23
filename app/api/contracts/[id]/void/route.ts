// path: app/api/contracts/[id]/void/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { voidSchema } from '@/services/contract/schemas';
import { voidContract } from '@/services/contract/send';

const params = z.object({ id: z.string().uuid() }).strict();

/** Cancels the request for signatures: every signing link stops working. */
export const POST = withApi(
  {
    id: 'contracts.void',
    scope: 'tenant',
    permission: { action: 'contract.send', resourceType: 'contract' },
    params,
    body: voidSchema,
    auditExempt: 'The database audit trigger and the contract event log record the change.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await voidContract(actor, p.id, body.reason) };
  },
);
