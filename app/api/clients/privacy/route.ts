// path: app/api/clients/privacy/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { privacyRequestSchema } from '@/lib/crm/privacy';
import { listPrivacyRequests, requestPrivacy } from '@/services/client/privacy';

export const GET = withApi(
  {
    id: 'clients.privacy_list',
    scope: 'tenant',
    permission: { action: 'client.privacy', resourceType: 'client' },
    query: z.object({ clientId: z.string().uuid() }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPrivacyRequests(actor.companyId, query.clientId) };
  },
);

export const POST = withApi(
  {
    id: 'clients.privacy_request',
    scope: 'tenant',
    permission: { action: 'client.privacy', resourceType: 'client' },
    stepUp: { maxAgeSeconds: 600 },
    rateLimitPolicy: 'strict',
    body: privacyRequestSchema,
    auditExempt: 'The privacy service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await requestPrivacy(actor, body) };
  },
);
