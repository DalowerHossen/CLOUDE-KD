// path: app/api/inventory/documents/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { documentActionSchema, documentUpdateSchema } from '@/lib/stock/documents';
import {
  cancelDocument,
  getDocument,
  postDocument,
  updateDocument,
} from '@/services/inventory/documents';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'inventory.documents', resourceType: 'inventory_document' } as const;

export const GET = withApi(
  {
    id: 'documents.get',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'inventory_document' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getDocument(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'documents.update',
    scope: 'tenant',
    permission,
    params,
    body: documentUpdateSchema,
    auditExempt: 'The document service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateDocument(actor, p.id, body.expectedVersion, body.document) };
  },
);

export const POST = withApi(
  {
    id: 'documents.action',
    scope: 'tenant',
    permission,
    params,
    body: documentActionSchema,
    auditExempt: 'The document service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data:
        body.action === 'post'
          ? await postDocument(actor, p.id)
          : await cancelDocument(actor, p.id),
    };
  },
);
