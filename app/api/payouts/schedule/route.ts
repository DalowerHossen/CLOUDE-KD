// path: app/api/payouts/schedule/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getSchedule, removeSchedule, saveSchedule } from '@/services/payout/schedule';

export const GET = withApi(
  {
    id: 'payouts.schedule.get',
    scope: 'tenant',
    permission: { action: 'wallet.read', resourceType: 'payout_schedule' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getSchedule(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'payouts.schedule.save',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'payout.method.manage', resourceType: 'payout_schedule' },
    body: z.strictObject({
      methodId: z.string().uuid(),
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      weekday: z.number().int().min(0).max(6).nullable().optional(),
      monthDay: z.number().int().min(1).max(28).nullable().optional(),
      keepAmount: z
        .string()
        .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter an amount like 100 or 100.50.')
        .optional(),
      enabled: z.boolean().optional(),
    }),
    auditExempt: 'The schedule service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await saveSchedule(actor, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'payouts.schedule.remove',
    scope: 'tenant',
    permission: { action: 'payout.method.manage', resourceType: 'payout_schedule' },
    auditExempt: 'The schedule service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeSchedule(actor);
    return { data: { ok: true } };
  },
);
