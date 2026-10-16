// path: app/api/settings/data/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import {
  closureSchema,
  createRequest,
  listRequests,
  requestSchema,
  runClosure,
} from '@/services/lifecycle/data';

export const GET = withApi(
  { id: 'data.list', scope: 'tenant', permission: { action: 'data.manage', resourceType: 'data' } },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRequests(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'data.request',
    scope: 'tenant',
    permission: { action: 'data.export', resourceType: 'data' },
    rateLimitPolicy: 'strict',
    body: requestSchema,
    auditExempt: 'The lifecycle service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 202, data: await createRequest(actor, body) };
  },
);

export const PUT = withApi(
  {
    id: 'data.closure',
    scope: 'tenant',
    permission: { action: 'data.manage', resourceType: 'data' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: closureSchema,
    auditExempt: 'The lifecycle service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runClosure(actor, body) };
  },
);
