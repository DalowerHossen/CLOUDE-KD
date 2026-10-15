// path: app/api/cron/[job]/route.ts
// Cron entry. The scheduler (Netlify scheduled function, pg_cron with pg_net, or a Linux cron on Docker) calls
// POST /api/cron/<job> with "Authorization: Bearer <CRON_SECRET>". The job must exist in cron/schedule.generated.ts.
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';
import { getServerEnv } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/utils/hash';
import { withLeaderLock } from '@/cron/base/leader-lock';
import { cronJobs } from '@/cron/schedule.generated';

const params = z.object({ job: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/) }).strict();

export const POST = withApi(
  {
    id: 'cron.run',
    scope: 'public',
    params,
    auditExempt: 'System job. Audit entries are written by the job itself.',
  },
  async ({ request, params: { job }, log }) => {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!timingSafeEqualStrings(token, getServerEnv().CRON_SECRET)) throw new UnauthorizedError();
    const definition = cronJobs.find((j) => j.name === job);
    if (!definition) throw new NotFoundError();
    const started = Date.now();
    const result = await withLeaderLock(job, definition.handler);
    log.info('cron job finished', { job, ran: result.ran, ms: Date.now() - started });
    return { data: { job, ran: result.ran, durationMs: Date.now() - started } };
  },
);
