// path: app/api/import/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { importActionSchema } from '@/lib/transfer/mapping';
import {
  getImport,
  previewImport,
  runAction,
  type ImportView,
  type PreviewResult,
} from '@/services/import/imports';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'import.manage', resourceType: 'import_job' } as const;

export const GET = withApi(
  { id: 'import.get', scope: 'tenant', permission, params },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getImport(actor.companyId, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'import.action',
    scope: 'tenant',
    permission,
    params,
    body: importActionSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The import service writes the audit entry.',
  },
  async ({ actor, params: p, body }): Promise<{ data: PreviewResult | ImportView }> => {
    if (!actor) throw new ForbiddenError();
    if (body.action === 'preview')
      return {
        data: await previewImport(actor, p.id, body.mapping, body.duplicateMode),
      };
    return { data: await runAction(actor, p.id, body) };
  },
);
