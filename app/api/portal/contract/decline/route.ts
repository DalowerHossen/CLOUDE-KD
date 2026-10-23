// path: app/api/portal/contract/decline/route.ts
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { declineBody } from '@/services/esign/schemas';
import { declineContract } from '@/services/esign/sign';
import { resolvePortalAccess } from '@/services/portal/access';

/** A signer declines; the contract ends as declined and every signing link stops working. */
export const POST = withApi(
  {
    id: 'portal.contractDecline',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: declineBody,
    auditExempt: 'The contract event log records the decision with the signer.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['contract']);
    if (access.state !== 'ok') throw new NotFoundError();
    await declineContract(access, body.reason);
    return { data: { declined: true } };
  },
);
