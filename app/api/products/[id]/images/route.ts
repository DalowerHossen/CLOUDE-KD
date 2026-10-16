// path: app/api/products/[id]/images/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { addImage, imageUploadSchema, removeImage } from '@/services/product/images';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'product.update', resourceType: 'product' } as const;

export const POST = withApi(
  {
    id: 'products.image_add',
    scope: 'tenant',
    permission,
    params,
    body: imageUploadSchema,
    rateLimitPolicy: 'upload',
    maxBodyBytes: 3_000_000,
    auditExempt: 'The image service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await addImage(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'products.image_remove',
    scope: 'tenant',
    permission,
    params,
    body: z.object({ fileId: z.string().uuid() }).strict(),
    auditExempt: 'The image service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await removeImage(actor, p.id, body.fileId);
    return { data: { done: true } };
  },
);
