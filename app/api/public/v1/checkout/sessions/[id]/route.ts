// path: app/api/public/v1/checkout/sessions/[id]/route.ts
// GET: the state of a session (open, paid, cancelled, expired). DELETE: the store cancelled the order.
import { withPublicApi } from '@/lib/integrations/public-api';
import { sessionParams } from '@/lib/checkout/session-rules';
import { cancelSession, getSession } from '@/services/checkout/sessions';

export const GET = withPublicApi(
  { id: 'public.checkout.sessions.get', resource: 'checkout', params: sessionParams },
  async ({ params, key, companyId, mode }) => ({
    data: await getSession({ companyId, keyId: key.id, createdBy: key.createdBy, mode }, params.id),
  }),
);

export const DELETE = withPublicApi(
  { id: 'public.checkout.sessions.cancel', resource: 'checkout', params: sessionParams },
  async ({ params, key, companyId, mode }) => {
    const session = await cancelSession(
      { companyId, keyId: key.id, createdBy: key.createdBy, mode },
      params.id,
    );
    return {
      data: session,
      audit: {
        action: 'public_api.checkout_session_cancelled',
        resourceType: 'checkout_session',
        resourceId: session.id,
      },
    };
  },
);
