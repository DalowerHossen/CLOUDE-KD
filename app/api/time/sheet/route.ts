// path: app/api/time/sheet/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timesheet } from '@/services/project/time';

export const GET = withApi(
  {
    id: 'time.sheet',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    query: z
      .object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        userId: z.string().uuid().optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await timesheet(actor, query.day, query.userId) };
  },
);
