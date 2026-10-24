// path: app/api/reports/schedules/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { scheduleInputSchema } from '@/lib/reports/params';
import { createSchedule, listSchedules } from '@/services/report/schedules';

export const GET = withApi(
  {
    id: 'reports.schedules',
    scope: 'tenant',
    permission: { action: 'report.schedule', resourceType: 'report_schedule' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listSchedules(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'reports.createSchedule',
    scope: 'tenant',
    permission: { action: 'report.schedule', resourceType: 'report_schedule' },
    body: scheduleInputSchema,
    auditExempt: 'The schedule service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createSchedule(actor, body) };
  },
);
