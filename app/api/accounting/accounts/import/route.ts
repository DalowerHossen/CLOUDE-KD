// path: app/api/accounting/accounts/import/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_IMPORT_BYTES } from '@/config/s15-accounting';
import { importAccounts } from '@/services/accounting/accounts';

export const POST = withApi(
  {
    id: 'accounting.accounts.import',
    scope: 'tenant',
    permission: { action: 'accounting.account.manage', resourceType: 'account' },
    body: z.strictObject({ csv: z.string().min(1).max(MAX_IMPORT_BYTES) }),
    maxBodyBytes: MAX_IMPORT_BYTES + 4096,
    auditExempt: 'The account service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await importAccounts(actor, body.csv) };
  },
);
