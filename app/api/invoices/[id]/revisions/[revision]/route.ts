// path: app/api/invoices/[id]/revisions/[revision]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getRevision, restoreRevision } from '@/services/invoice/invoices';

const params = z
  .object({ id: z.string().uuid(), revision: z.string().regex(/^[1-9]\d{0,5}$/) })
  .strict();

export const GET = withApi(
  {
    id: 'invoices.revision',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getRevision(actor.companyId, p.id, toInt(p.revision, 1)) };
  },
);

export const POST = withApi(
  {
    id: 'invoices.revision_restore',
    scope: 'tenant',
    permission: { action: 'invoice.update', resourceType: 'invoice' },
    params,
    body: z.object({ expectedVersion: z.number().int().min(1) }).strict(),
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data: await restoreRevision(actor, p.id, body.expectedVersion, toInt(p.revision, 1)),
    };
  },
);
