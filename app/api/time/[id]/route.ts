// path: app/api/time/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timeEntryUpdateSchema } from '@/lib/project/input';
import { deleteEntry, updateEntry } from '@/services/project/time';

const params = z.object({ id: z.string().uuid() }).strict();

export const PUT = withApi(
  {
    id: 'time.update',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    params,
    body: timeEntryUpdateSchema,
    auditExempt: 'Time entries are audited by the database.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateEntry(actor, p.id, body.expectedVersion, body.entry) };
  },
);

export const DELETE = withApi(
  {
    id: 'time.delete',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    params,
    auditExempt: 'Time entries are audited by the database.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteEntry(actor, p.id);
    return { data: { id: p.id } };
  },
);
