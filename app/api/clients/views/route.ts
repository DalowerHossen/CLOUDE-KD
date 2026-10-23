// path: app/api/clients/views/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { viewCreateSchema, viewDeleteSchema } from '@/lib/crm/search';
import { createView, deleteView, listViews } from '@/services/client/views';

const permission = { action: 'client.read', resourceType: 'client' } as const;

export const GET = withApi(
  {
    id: 'views.list',
    scope: 'tenant',
    permission,
    query: z
      .object({ listKey: z.enum(['clients', 'products', 'suppliers', 'purchase_orders']) })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listViews(actor, query.listKey) };
  },
);

export const POST = withApi(
  {
    id: 'views.create',
    scope: 'tenant',
    permission,
    body: viewCreateSchema,
    auditExempt: 'The view service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createView(actor, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'views.delete',
    scope: 'tenant',
    permission,
    body: viewDeleteSchema,
    auditExempt: 'The view service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await deleteView(actor, body.id);
    return { data: { done: true } };
  },
);
