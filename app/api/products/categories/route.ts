// path: app/api/products/categories/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { categoryDeleteSchema, categorySaveSchema } from '@/lib/catalog/products';
import { deleteCategory, listCategories, saveCategory } from '@/services/product/categories';

const read = { action: 'product.read', resourceType: 'product' } as const;
const write = { action: 'product.update', resourceType: 'product' } as const;

export const GET = withApi(
  { id: 'categories.list', scope: 'tenant', permission: read },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listCategories(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'categories.save',
    scope: 'tenant',
    permission: write,
    body: categorySaveSchema,
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveCategory(actor, body);
    return { data: await listCategories(actor.companyId as string) };
  },
);

export const DELETE = withApi(
  {
    id: 'categories.delete',
    scope: 'tenant',
    permission: write,
    body: categoryDeleteSchema,
    auditExempt: 'The category service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await deleteCategory(actor, body.id);
    return { data: await listCategories(actor.companyId as string) };
  },
);
