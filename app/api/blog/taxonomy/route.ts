// path: app/api/blog/taxonomy/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { deleteTaxonomy, saveTaxonomy } from '@/services/blog/admin';
import { taxonomyDeleteSchema, taxonomySchema } from '@/services/blog/schemas';

const permission = { action: 'blog.edit', resourceType: 'blog' } as const;

export const POST = withApi(
  {
    id: 'blog.taxonomy.save',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    body: taxonomySchema,
    auditExempt: 'The blog service writes the audit entry.',
  },
  async ({ body }) => {
    await saveTaxonomy(body);
    return { data: { done: true } };
  },
);

export const DELETE = withApi(
  {
    id: 'blog.taxonomy.delete',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    query: taxonomyDeleteSchema,
    body: z.undefined(),
    auditExempt: 'The blog service writes the audit entry.',
  },
  async ({ query }) => {
    await deleteTaxonomy(query.kind, query.id);
    return { data: { done: true } };
  },
);
