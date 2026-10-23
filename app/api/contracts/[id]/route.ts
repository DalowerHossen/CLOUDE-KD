// path: app/api/contracts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getContract, saveContract, trashDraft } from '@/services/contract/contracts';
import { contractUpdateSchema } from '@/services/contract/schemas';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'contracts.get',
    scope: 'tenant',
    permission: { action: 'contract.read', resourceType: 'contract' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getContract(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'contracts.save',
    scope: 'tenant',
    permission: { action: 'contract.create', resourceType: 'contract' },
    params,
    body: contractUpdateSchema,
    maxBodyBytes: 300_000,
    auditExempt: 'The database audit trigger and the contract event log record the change.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveContract(actor, p.id, body.expectedVersion, body.contract) };
  },
);

export const DELETE = withApi(
  {
    id: 'contracts.trash',
    scope: 'tenant',
    permission: { action: 'contract.create', resourceType: 'contract' },
    params,
    auditExempt: 'The database audit trigger records the change.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await trashDraft(actor, p.id);
    return { data: { id: p.id } };
  },
);
