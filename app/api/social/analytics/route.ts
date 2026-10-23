// path: app/api/social/analytics/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ANALYTICS_MAX_DAYS } from '@/config/s16-social';
import { ForbiddenError } from '@/lib/errors';
import { overview } from '@/services/social/analytics';

export const GET = withApi(
  {
    id: 'social.analytics',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_post' },
    query: z
      .object({
        days: z.coerce.number().int().min(1).max(ANALYTICS_MAX_DAYS).default(30),
        timezone: z.string().trim().min(1).max(60).default('UTC'),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await overview(actor.companyId, query) };
  },
);
