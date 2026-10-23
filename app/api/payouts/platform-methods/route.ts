// path: app/api/payouts/platform-methods/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  platformMethodInput,
  platformRows,
  savePlatformMethod,
} from '@/services/payout/payment-methods';

export const GET = withApi(
  {
    id: 'payouts.platform-methods.list',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'payment.methods.platform', resourceType: 'payment_method' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await platformRows() };
  },
);

export const PUT = withApi(
  {
    id: 'payouts.platform-methods.save',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'payment.methods.platform', resourceType: 'payment_method' },
    body: platformMethodInput,
    auditExempt: 'The payment method service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await savePlatformMethod(actor, body);
    return { data: { ok: true } };
  },
);
