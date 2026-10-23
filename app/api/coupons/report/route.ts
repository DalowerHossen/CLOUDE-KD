// path: app/api/coupons/report/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { couponReport } from '@/services/coupon/reports';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31.');

export const GET = withApi(
  {
    id: 'coupons.report',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'coupon.manage', resourceType: 'coupon' },
    query: z.strictObject({ from: day, to: day }),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    if (query.from >= query.to)
      throw new ValidationError('The end date must be after the start date.');
    return { data: await couponReport(actor, query.from, query.to) };
  },
);
