// path: app/api/accounting/journals/import/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_IMPORT_BYTES } from '@/config/s15-accounting';
import { importJournals } from '@/services/accounting/journals';

export const POST = withApi(
  {
    id: 'accounting.journals.import',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    body: z.strictObject({ csv: z.string().min(1).max(MAX_IMPORT_BYTES) }),
    maxBodyBytes: MAX_IMPORT_BYTES + 4096,
    idempotent: true,
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await importJournals(actor, body.csv) };
  },
);
