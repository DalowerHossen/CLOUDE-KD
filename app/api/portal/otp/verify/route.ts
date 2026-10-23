// path: app/api/portal/otp/verify/route.ts
import { withApi } from '@/lib/api/with-api';
import { getService } from '@/lib/container';
import { otpVerifyBody } from '@/services/portal/schemas';
import { recordPortalEvent } from '@/services/portal/events';
import { grantOtpSession } from '@/services/portal/otp-session';

/** Checks the one-time code. On success a signed cookie opens this link only; the tokens service counts failures and locks. */
export const POST = withApi(
  {
    id: 'portal.otp.verify',
    scope: 'public',
    networkContext: 'other',
    rateLimitPolicy: 'strict',
    body: otpVerifyBody,
    auditExempt: 'The tokens service stores a token event for every code step.',
  },
  async ({ body }) => {
    const checked = await getService('tokens').verify(body.token);
    if (!checked.valid || !checked.otpRequired) return { data: { ok: false } };
    const ok = await getService('tokens').verifyOtp(checked.id, body.code);
    if (ok) {
      await grantOtpSession(checked.id);
      await recordPortalEvent(
        {
          tokenId: checked.id,
          companyId: checked.companyId,
          docType: checked.docType,
          docId: checked.docId,
        },
        'code_passed',
      );
    }
    return { data: { ok } };
  },
);
