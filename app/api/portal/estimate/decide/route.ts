// path: app/api/portal/estimate/decide/route.ts
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { resolvePortalAccess } from '@/services/portal/access';
import { decidePortalEstimate } from '@/services/portal/estimate-view';
import { decideBody } from '@/services/portal/schemas';

/** The client accepts or declines an estimate with a typed name. The estimate service stores the signature record. */
export const POST = withApi(
  {
    id: 'portal.estimateDecide',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: decideBody,
    auditExempt: 'The estimate service writes the signature record and the estimate event.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['estimate']);
    if (access.state !== 'ok') throw new NotFoundError();
    const { token, ...answer } = body;
    return { status: 200, data: await decidePortalEstimate(token, answer) };
  },
);
