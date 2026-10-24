// path: app/api/import/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { importUploadSchema } from '@/lib/transfer/mapping';
import { createImport, listImports } from '@/services/import/imports';

export const GET = withApi(
  {
    id: 'import.list',
    scope: 'tenant',
    permission: { action: 'import.manage', resourceType: 'import_job' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listImports(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'import.create',
    scope: 'tenant',
    permission: { action: 'import.manage', resourceType: 'import_job' },
    body: importUploadSchema,
    rateLimitPolicy: 'upload',
    maxBodyBytes: 10_485_760,
    auditExempt: 'The import service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createImport(actor, body) };
  },
);
