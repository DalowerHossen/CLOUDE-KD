// path: app/api/social/schedules/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { scheduleUpdate } from '@/lib/social/schedule';
import { deleteSchedule, updateSchedule } from '@/services/social/schedules';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'social.schedules.update',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_schedule' },
    params,
    body: scheduleUpdate,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateSchedule(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'social.schedules.remove',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_schedule' },
    params,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteSchedule(actor, p.id);
    return { data: { ok: true } };
  },
);
