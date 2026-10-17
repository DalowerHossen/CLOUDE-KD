// path: app/api/reports/schedules/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteSchedule, setScheduleEnabled } from '@/services/report/schedules';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'reports.toggleSchedule',
    scope: 'tenant',
    permission: { action: 'report.schedule', resourceType: 'report_schedule' },
    params,
    body: z.object({ enabled: z.boolean() }).strict(),
    auditExempt: 'The schedule service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await setScheduleEnabled(actor, p.id, body.enabled) };
  },
);

export const DELETE = withApi(
  {
    id: 'reports.deleteSchedule',
    scope: 'tenant',
    permission: { action: 'report.schedule', resourceType: 'report_schedule' },
    params,
    auditExempt: 'The schedule service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await deleteSchedule(actor, p.id) };
  },
);
