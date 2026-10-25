// path: app/api/public/v1/checkout/sessions/route.ts
// POST: a store asks for a hosted checkout session for one order (the white-label checkout API). The scope is write:checkout.
import { withPublicApi } from '@/lib/integrations/public-api';
import { sessionInput } from '@/lib/checkout/session-rules';
import { createSession } from '@/services/checkout/sessions';

export const POST = withPublicApi(
  {
    id: 'public.checkout.sessions.create',
    resource: 'checkout',
    body: sessionInput,
    idempotent: true,
  },
  async ({ body, key, companyId, mode }) => {
    const { session, created } = await createSession(
      { companyId, keyId: key.id, createdBy: key.createdBy, mode },
      body,
    );
    return {
      status: created ? 201 : 200,
      data: session,
      audit: {
        action: 'public_api.checkout_session_requested',
        resourceType: 'checkout_session',
        resourceId: session.id,
        metadata: { orderId: session.order_id, created },
      },
    };
  },
);
