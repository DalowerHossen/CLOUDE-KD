// path: app/api/subscriptions/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { surveyAnswerSchema } from '@/lib/platform/retention';
import { recordContinued } from '@/services/platform/retention';
import { cancelSubscription, getSubscription } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.cancel',
    scope: 'tenant',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    body: z.strictObject({ reason: plain(3, 300), survey: surveyAnswerSchema.optional() }),
    auditExempt: 'The subscription service writes the audit entry and the subscription history.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const before = await getSubscription(actor.companyId).catch(() => null);
    const result = await cancelSubscription(actor, body.reason);
    if (body.survey)
      await recordContinued(actor, 'cancel', body.survey, before?.planSlug ?? null, null);
    return { data: result };
  },
);
