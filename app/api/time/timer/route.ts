// path: app/api/time/timer/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { timerStartSchema } from '@/lib/project/input';
import { currentTimer, startTimer, stopTimer } from '@/services/project/time';

export const GET = withApi(
  {
    id: 'time.timer',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await currentTimer(actor) };
  },
);

export const POST = withApi(
  {
    id: 'time.timerStart',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    body: timerStartSchema,
    auditExempt: 'Time entries are audited by the database.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await startTimer(actor, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'time.timerStop',
    scope: 'tenant',
    permission: { action: 'time.log', resourceType: 'time_entry' },
    auditExempt: 'Time entries are audited by the database.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await stopTimer(actor) };
  },
);
