// path: app/api/companies/onboarding/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { stepSchema } from '@/lib/company/steps';
import { applyStep, onboardingView } from '@/services/company/onboarding';

const permission = { action: 'company.manage', resourceType: 'company' } as const;

export const GET = withApi(
  { id: 'company.onboarding.get', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await onboardingView(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'company.onboarding.step',
    scope: 'tenant',
    permission,
    body: stepSchema,
    auditExempt: 'The settings service writes an audit entry for every saved section.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await applyStep(actor, body) };
  },
);
