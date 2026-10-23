// path: app/api/payroll/portal/links/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { linkInput } from '@/services/payroll/portal-rules';
import { issueLink, listLinks } from '@/services/payroll/portal';

export const GET = withApi(
  {
    id: 'payroll.portal.links',
    scope: 'tenant',
    permission: { action: 'payroll.portal.manage', resourceType: 'employee' },
    query: z.strictObject({ employeeId: z.string().uuid() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listLinks(actor.companyId, query.employeeId) };
  },
);

export const POST = withApi(
  {
    id: 'payroll.portal.link_issue',
    scope: 'tenant',
    permission: { action: 'payroll.portal.manage', resourceType: 'employee' },
    body: z.object({ employeeId: z.string().uuid() }).merge(linkInput).strict(),
    idempotent: true,
    stepUp: { maxAgeSeconds: 900 },
    auditExempt: 'The portal service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const { employeeId, ...rest } = body;
    return { status: 201, data: await issueLink(actor, employeeId, rest) };
  },
);
