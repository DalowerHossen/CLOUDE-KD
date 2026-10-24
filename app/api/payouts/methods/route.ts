// path: app/api/payouts/methods/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { addMethod, listMethods, methodInput } from '@/services/payout/methods';

export const GET = withApi(
  {
    id: 'payouts.methods.list',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'payout_method' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listMethods(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'payouts.methods.add',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payout.method.manage', resourceType: 'payout_method' },
    rateLimitPolicy: 'strict',
    body: methodInput,
    auditExempt: 'The payout method service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addMethod(actor, body) };
  },
);
