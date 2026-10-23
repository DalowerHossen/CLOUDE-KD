// path: app/api/coupons/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { couponInput } from '@/lib/payment/coupon-rules';
import { createCoupon, listCoupons } from '@/services/coupon/coupons';

export const GET = withApi(
  {
    id: 'coupons.list',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'coupon.manage', resourceType: 'coupon' },
    query: z.strictObject({}),
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listCoupons(actor) };
  },
);

export const POST = withApi(
  {
    id: 'coupons.create',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'coupon.manage', resourceType: 'coupon' },
    body: couponInput,
    auditExempt: 'The coupon service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createCoupon(actor, body) };
  },
);
