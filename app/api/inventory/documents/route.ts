// path: app/api/inventory/documents/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { documentInputSchema, documentListQuery } from '@/lib/stock/documents';
import { createDocument, listDocuments } from '@/services/inventory/documents';

export const GET = withApi(
  {
    id: 'documents.list',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'inventory_document' },
    query: documentListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDocuments(actor.companyId, query) };
  },
);

export const POST = withApi(
  {
    id: 'documents.create',
    scope: 'tenant',
    permission: { action: 'inventory.documents', resourceType: 'inventory_document' },
    body: documentInputSchema,
    auditExempt: 'The document service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createDocument(actor, body) };
  },
);
