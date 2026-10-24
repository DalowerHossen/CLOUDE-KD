// path: app/api/admin/payment-review/blocked-cards/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { unblockCard } from '@/services/payment/reviews';

const params = z.object({ id: z.string().uuid() }).strict();

export const DELETE = withApi(
  {
    id: 'admin.blockedCards.remove',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payment.card.block', resourceType: 'card_blacklist' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    auditExempt: 'The review service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await unblockCard(actor, p.id);
    return { data: { removed: true } };
  },
);
