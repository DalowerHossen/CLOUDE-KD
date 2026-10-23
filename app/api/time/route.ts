// path: app/api/time/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timeEntryInputSchema } from '@/lib/project/input';
import { createEntry, listEntries } from '@/services/project/time';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = withApi(
  {
    id: 'time.list',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    query: z
      .object({
        projectId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        from: day.optional(),
        to: day.optional(),
        status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'invoiced']).optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEntries(actor, { ...query, limit: 500 }) };
  },
);

export const POST = withApi(
  {
    id: 'time.create',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    body: timeEntryInputSchema,
    idempotent: true,
    auditExempt: 'Time entries are audited by the database.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createEntry(actor, body) };
  },
);
