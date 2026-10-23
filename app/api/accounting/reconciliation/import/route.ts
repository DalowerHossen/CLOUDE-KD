// path: app/api/accounting/reconciliation/import/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { importInput } from '@/services/reconciliation/inputs';
import { MAX_STATEMENT_BYTES } from '@/services/reconciliation/statement-parsers';
import { importStatement } from '@/services/reconciliation/transactions';

export const POST = withApi(
  {
    id: 'bank.import',
    scope: 'tenant',
    permission: { action: 'accounting.reconcile', resourceType: 'bank_account' },
    body: importInput,
    maxBodyBytes: MAX_STATEMENT_BYTES + 8192,
    idempotent: true,
    auditExempt: 'The import service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await importStatement(actor, body) };
  },
);
