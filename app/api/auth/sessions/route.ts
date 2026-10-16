// path: app/api/auth/sessions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { listSessions, requireActor } from '@/services/auth/account-ops';

const query = z.object({ company: z.enum(['0', '1']).default('0') }).strict();

export const GET = withApi(
  { id: 'auth.sessions.list', scope: 'public', query },
  async ({ query: q }) => {
    const actor = await requireActor();
    return { data: { items: await listSessions(actor, q.company === '1') } };
  },
);
