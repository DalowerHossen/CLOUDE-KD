// path: app/api/contracts/[id]/request-send/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { sendSchema } from '@/services/contract/schemas';
import { requestContractSend, withdrawContractRequest } from '@/services/contract/send-gate';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'contract.request_send', resourceType: 'contract' } as const;

/** Staff: ask the owner to send this draft. The owner decides in the approvals; a job sends it when approved. */
export const POST = withApi(
  {
    id: 'contracts.requestSend',
    scope: 'tenant',
    permission,
    rateLimitPolicy: 'strict',
    params,
    body: sendSchema,
    auditExempt: 'The approval service and the contract event log record the request.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await requestContractSend(actor, p.id, body.message) };
  },
);

export const DELETE = withApi(
  {
    id: 'contracts.withdrawRequest',
    scope: 'tenant',
    permission,
    params,
    auditExempt: 'The contract event log records the change.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await withdrawContractRequest(actor, p.id) };
  },
);
