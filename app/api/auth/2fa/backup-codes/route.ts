// path: app/api/auth/2fa/backup-codes/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { regenerateCodes, requireActor } from '@/services/auth/account-ops';

export const POST = withApi(
  {
    id: 'auth.2fa.backup_codes',
    scope: 'public',
    body: z.object({}).strict(),
    auditExempt: 'The service writes the audit entry.',
  },
  async () => ({ data: { backupCodes: await regenerateCodes(await requireActor()) } }),
);
