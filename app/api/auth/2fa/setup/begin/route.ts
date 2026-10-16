// path: app/api/auth/2fa/setup/begin/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { beginPendingSetup } from '@/services/auth/second-factor-flow';

export const POST = withApi(
  {
    id: 'auth.2fa.setup.begin',
    scope: 'public',
    networkContext: 'login',
    body: z.object({}).strict(),
    auditExempt: 'A pending enrollment changes nothing durable; the confirmation is audited.',
  },
  async () => ({ data: await beginPendingSetup() }),
);
