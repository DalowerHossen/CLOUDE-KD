// path: app/api/contracts/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listContracts, saveContract } from '@/services/contract/contracts';
import { contractInputSchema, listQuerySchema } from '@/services/contract/schemas';

export const GET = withApi(
  {
    id: 'contracts.list',
    scope: 'tenant',
    permission: { action: 'contract.read', resourceType: 'contract' },
    query: listQuerySchema,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listContracts(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'contracts.create',
    scope: 'tenant',
    permission: { action: 'contract.create', resourceType: 'contract' },
    body: contractInputSchema,
    maxBodyBytes: 300_000,
    auditExempt: 'The database audit trigger and the contract event log record the change.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await saveContract(actor, null, 0, body) };
  },
);
