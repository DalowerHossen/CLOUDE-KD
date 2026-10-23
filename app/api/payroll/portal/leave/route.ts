// path: app/api/payroll/portal/leave/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { portalLeaveInput } from '@/services/hr/hr-rules';
import { submitPortalLeave } from '@/services/hr/leave';
import { resolvePortalAccess } from '@/services/portal/access';
import { portalTokenSchema } from '@/services/portal/schemas';

/** An employee asks for leave from the portal. The link decides who the employee is; a bad link gets the same answer. */
export const POST = withApi(
  {
    id: 'payroll.portal.leave',
    scope: 'public',
    networkContext: 'other',
    rateLimitPolicy: 'strict',
    body: z.object({ token: portalTokenSchema, request: portalLeaveInput }).strict(),
    auditExempt: 'The leave service writes the audit entry.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['payslip']);
    if (access.state !== 'ok') throw new ValidationError('This link cannot be used.');
    return { status: 201, data: await submitPortalLeave(access, body.request) };
  },
);
