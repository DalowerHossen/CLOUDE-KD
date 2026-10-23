// path: app/api/auth/2fa/enroll/begin/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { beginAccountEnrollment, requireActor } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.2fa.enroll.begin',
    scope: 'public',
    body: z.object({}).strict(),
    auditExempt: 'A pending enrollment changes nothing durable; the confirmation is audited.',
  },
  async () => ({ data: await beginAccountEnrollment(await requireActor()) }),
);
