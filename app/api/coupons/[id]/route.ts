// path: app/api/coupons/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { couponUpdateInput } from '@/lib/payment/coupon-rules';
import { deleteCoupon, updateCoupon } from '@/services/coupon/coupons';

const params = z.object({ id: z.string().uuid() }).strict();

export const PUT = withApi(
  {
    id: 'coupons.update',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'coupon.manage', resourceType: 'coupon' },
    params,
    body: z.object({ version: z.number().int().min(1), changes: couponUpdateInput }).strict(),
    auditExempt: 'The coupon service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateCoupon(actor, p.id, body.version, body.changes) };
  },
);

export const DELETE = withApi(
  {
    id: 'coupons.delete',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'coupon.manage', resourceType: 'coupon' },
    params,
    auditExempt: 'The coupon service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteCoupon(actor, p.id);
    return { data: { ok: true } };
  },
);
