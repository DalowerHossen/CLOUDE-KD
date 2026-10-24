// path: app/api/payroll/portal/links/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { revokeLink } from '@/services/payroll/portal';

export const DELETE = withApi(
  {
    id: 'payroll.portal.link_revoke',
    scope: 'tenant',
    permission: { action: 'payroll.portal.manage', resourceType: 'employee' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The portal service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await revokeLink(actor, params.id);
    return { data: { ok: true } };
  },
);
