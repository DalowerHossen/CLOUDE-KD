// path: app/api/portal/branding/reset/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { resetBranding } from '@/services/branding/save';

export const POST = withApi(
  {
    id: 'portal.branding.reset',
    scope: 'tenant',
    permission: { action: 'company.manage', resourceType: 'company' },
    body: z.strictObject({ expectedVersion: z.number().int().min(0) }),
    auditExempt: 'The settings service and the branding history record the change.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await resetBranding(actor, body.expectedVersion) };
  },
);
