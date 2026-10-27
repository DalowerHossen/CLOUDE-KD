// path: app/api/admin/processors/onboarding/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createApplicationInput } from '@/lib/payment/onboarding/rules';
import { createApplication, listApplications, listCompanies } from '@/services/payment/onboarding';

export const GET = withApi(
  {
    id: 'admin.onboarding.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
  },
  async () => ({
    data: { applications: await listApplications(), companies: await listCompanies() },
  }),
);

export const POST = withApi(
  {
    id: 'admin.onboarding.create',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: createApplicationInput,
    auditExempt: 'The onboarding service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createApplication(actor, body) };
  },
);
