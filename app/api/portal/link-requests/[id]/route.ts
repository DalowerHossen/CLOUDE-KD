// path: app/api/portal/link-requests/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decideLinkRequest } from '@/services/portal/link-requests';
import { decideRequestBody } from '@/services/portal/schemas';

const params = z.object({ id: z.string().uuid() }).strict();

/** Approve (a new link goes to the address on file) or deny (with a reason). A request is decided once. */
export const POST = withApi(
  {
    id: 'portal.linkRequests.decide',
    scope: 'tenant',
    permission: { action: 'portal.link.decide', resourceType: 'link_request' },
    rateLimitPolicy: 'strict',
    params,
    body: decideRequestBody,
    auditExempt:
      'The link request table has the audit trigger; the delivery proof records the message.',
  },
  async ({ actor, params: p, body: b }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await decideLinkRequest(actor, p.id, b.decision, b.reason) };
  },
);
