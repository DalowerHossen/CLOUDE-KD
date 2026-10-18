// path: app/api/portal/consent/route.ts
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { consentBody } from '@/services/portal/schemas';
import { resolvePortalAccess } from '@/services/portal/access';
import { captureConsent } from '@/services/portal/consent-capture';

/** The payer accepted the terms and the refund policy. Only a payment link in good standing can record it. */
export const POST = withApi(
  {
    id: 'portal.consent',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    body: consentBody,
    auditExempt: 'The consent record is the audit trail (append only, with address and device).',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['payment']);
    if (access.state !== 'ok') throw new NotFoundError();
    const saved = await captureConsent(access);
    return { status: 201, data: { id: saved.id } };
  },
);
