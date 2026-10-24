// path: app/api/portal/contract/sign/route.ts
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { signContract } from '@/services/esign/sign';
import { signBody } from '@/services/esign/schemas';
import { resolvePortalAccess } from '@/services/portal/access';

/** A signer signs with a typed name, a drawing or a picture. The evidence is taken from this request, never the body. */
export const POST = withApi(
  {
    id: 'portal.contractSign',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: signBody,
    maxBodyBytes: 900_000,
    auditExempt:
      'The signature record and the contract event are the audit trail (append only, with address and device).',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['contract']);
    if (access.state !== 'ok') throw new NotFoundError();
    return { status: 201, data: await signContract(access, body) };
  },
);
