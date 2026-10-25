// path: app/api/social/connect/facebook/select/route.ts
import { z } from 'zod';
import { CONNECT_MAX_PICKS } from '@/config/s16-social';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { saveChoices } from '@/services/social/meta-connect';

/** The owner picks which Pages and Instagram accounts to connect. */
export const POST = withApi(
  {
    id: 'social.connect.facebook.select',
    scope: 'tenant',
    permission: { action: 'social.manage', resourceType: 'social_account' },
    rateLimitPolicy: 'strict',
    body: z.strictObject({
      sessionId: z.string().uuid(),
      picks: z
        .array(
          z.strictObject({
            kind: z.enum(['facebook', 'instagram']),
            pageId: z.string().regex(/^\d{5,30}$/),
          }),
        )
        .min(1)
        .max(CONNECT_MAX_PICKS),
    }),
    auditExempt:
      'The connect service writes the audit entry; each account connected also writes its own.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await saveChoices(actor, body.sessionId, body.picks) };
  },
);
