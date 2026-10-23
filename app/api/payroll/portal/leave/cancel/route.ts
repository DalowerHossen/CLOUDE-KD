// path: app/api/payroll/portal/leave/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { cancelPortalLeave } from '@/services/hr/leave';
import { resolvePortalAccess } from '@/services/portal/access';
import { portalTokenSchema } from '@/services/portal/schemas';

/** An employee cancels their own waiting request from the portal. */
export const POST = withApi(
  {
    id: 'payroll.portal.leave_cancel',
    scope: 'public',
    networkContext: 'other',
    rateLimitPolicy: 'strict',
    body: z.strictObject({ token: portalTokenSchema, id: z.string().uuid() }),
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['payslip']);
    if (access.state !== 'ok') throw new ValidationError('This link cannot be used.');
    await cancelPortalLeave(access, body.id);
    return { data: { ok: true } };
  },
);
