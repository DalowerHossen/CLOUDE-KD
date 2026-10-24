// path: app/api/settings/sso/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { requestSso, ssoReadiness } from '@/services/company/sso';

const permission = { action: 'sso.manage', resourceType: 'company' } as const;

export const GET = withApi(
  { id: 'company.sso.readiness', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await ssoReadiness(actor) };
  },
);

export const POST = withApi(
  {
    id: 'company.sso.request',
    scope: 'tenant',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    body: z.object({ action: z.literal('request') }).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await requestSso(actor) };
  },
);
