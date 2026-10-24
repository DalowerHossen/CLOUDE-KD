// path: app/api/payouts/methods/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeMethod, setDefaultMethod } from '@/services/payout/methods';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'payouts.methods.default',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payout.method.manage', resourceType: 'payout_method' },
    params,
    body: z.strictObject({}),
    auditExempt: 'The payout method service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await setDefaultMethod(actor, p.id);
    return { data: { ok: true } };
  },
);

export const DELETE = withApi(
  {
    id: 'payouts.methods.remove',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payout.method.manage', resourceType: 'payout_method' },
    params,
    auditExempt: 'The payout method service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeMethod(actor, p.id);
    return { data: { ok: true } };
  },
);
