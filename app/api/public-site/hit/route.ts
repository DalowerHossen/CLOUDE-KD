// path: app/api/public-site/hit/route.ts
// First-party visit counter: no cookie, no address, no visitor data. Only a number goes up.
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { SITE_EVENTS } from '@/lib/analytics/providers';
import { countHit } from '@/services/analytics/pixels';

export const POST = withApi(
  {
    id: 'public.hit',
    scope: 'public',
    body: z
      .object({
        path: z.string().regex(/^\/[a-z0-9/._-]{0,120}$/),
        event: z.enum(SITE_EVENTS),
      })
      .strict(),
    auditExempt: 'Only an anonymous counter changes; no personal data is stored.',
  },
  async ({ body }) => ({ status: 202, data: { counted: await countHit(body.path, body.event) } }),
);
