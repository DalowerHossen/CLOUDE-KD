// path: app/api/portal/rerequest/route.ts
import { withApi } from '@/lib/api/with-api';
import { tokenOnlyBody } from '@/schemas/portal/portal';
import { requestNewLink } from '@/services/portal/rerequest';

/** A client asks for a new link after the old one expired. The answer never depends on the link. */
export const POST = withApi(
  {
    id: 'portal.rerequest',
    scope: 'public',
    networkContext: 'other',
    rateLimitPolicy: 'strict',
    body: tokenOnlyBody,
    auditExempt: 'The service writes the audit entry when a request is created.',
  },
  async ({ body }) => {
    await requestNewLink(body.token);
    return { status: 202, data: { requested: true } };
  },
);
