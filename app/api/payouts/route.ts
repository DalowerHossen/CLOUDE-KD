// path: app/api/payouts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { PAYOUT_STATUSES } from '@/lib/payment/payout';
import { Money } from '@/lib/utils/currency';
import { listPayouts, requestPayout } from '@/services/payout/payouts';

export const GET = withApi(
  {
    id: 'payouts.list',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'payout' },
    query: z.strictObject({ status: z.enum(PAYOUT_STATUSES).optional() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPayouts(actor.companyId, { status: query.status }) };
  },
);

export const POST = withApi(
  {
    id: 'payouts.request',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payout.request', resourceType: 'payout' },
    rateLimitPolicy: 'strict',
    idempotent: true,
    body: z.strictObject({
      methodId: z.string().uuid(),
      amount: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 100 or 100.50.'),
      note: plain(0, 300).optional(),
    }),
    auditExempt: 'The payout service writes the audit entry of every payout step.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (!idempotencyKey) throw new ValidationError('The Idempotency-Key header is required.');
    const payout = await requestPayout(actor, {
      methodId: body.methodId,
      amount: Money.parse(body.amount),
      idempotencyKey,
      note: body.note,
    });
    return { status: 201, data: payout };
  },
);
