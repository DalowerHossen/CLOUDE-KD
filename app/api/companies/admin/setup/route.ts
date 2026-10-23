// path: app/api/companies/admin/setup/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { setupSchema } from '@/lib/company/ops-input';
import { completeStep, setupView } from '@/services/company/platform-setup';

const permission = { action: 'setup.manage', resourceType: 'platform' } as const;

export const GET = withApi(
  { id: 'admin.setup.view', scope: 'platform', networkContext: 'admin', permission },
  async () => ({ data: await setupView() }),
);

export const POST = withApi(
  {
    id: 'admin.setup.step',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    body: setupSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await completeStep(actor, body);
    return { data: { done: true } };
  },
);
