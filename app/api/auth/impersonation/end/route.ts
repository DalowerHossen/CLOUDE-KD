// path: app/api/auth/impersonation/end/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { endImpersonation } from '@/services/auth/impersonation-flow';

export const POST = withApi(
  {
    id: 'auth.impersonation.end',
    scope: 'public',
    body: z.object({}).strict(),
    auditExempt: 'The impersonation service writes the audit entry.',
  },
  async () => ({ data: await endImpersonation() }),
);
