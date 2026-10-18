// path: app/api/portal/otp/send/route.ts
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { tokenOnlyBody } from '@/services/portal/schemas';

/** Sends the one-time code of a link. The answer is the same for every link, so it cannot be used to test links. */
export const POST = withApi(
  {
    id: 'portal.otp.send',
    scope: 'public',
    networkContext: 'other',
    rateLimitPolicy: 'strict',
    body: tokenOnlyBody,
    auditExempt: 'The tokens service stores a token event for every code step.',
  },
  async ({ body }) => {
    const checked = await getService('tokens').verify(body.token);
    if (checked.valid && checked.otpRequired) await getService('tokens').sendOtp(checked.id);
    return { data: { sent: true } };
  },
);
