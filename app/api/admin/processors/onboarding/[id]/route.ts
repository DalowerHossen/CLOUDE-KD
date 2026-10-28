// path: app/api/admin/processors/onboarding/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { updateApplicationInput } from '@/lib/payment/onboarding/rules';
import { readRemoteApplication, updateApplication } from '@/services/payment/onboarding';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'admin.onboarding.get',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
    params,
  },
  async ({ params: p }) => ({ data: await readRemoteApplication(p.id) }),
);

export const PATCH = withApi(
  {
    id: 'admin.onboarding.update',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: updateApplicationInput,
    auditExempt: 'The onboarding service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateApplication(actor, p.id, body) };
  },
);
