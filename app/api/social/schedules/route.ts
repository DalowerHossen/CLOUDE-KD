// path: app/api/social/schedules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { scheduleInput } from '@/lib/social/schedule';
import { createSchedule, listSchedules } from '@/services/social/schedules';

export const GET = withApi(
  {
    id: 'social.schedules.list',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_schedule' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listSchedules(actor.companyId) };
  },
);

/** Makes a posting schedule: the posts for the coming 14 days are made at once. */
export const POST = withApi(
  {
    id: 'social.schedules.create',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_schedule' },
    body: scheduleInput,
    idempotent: true,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createSchedule(actor, body) };
  },
);
