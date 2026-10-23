// path: app/api/social/evergreen/items/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { evergreenItemUpdate } from '@/lib/social/schedule';
import { deleteItem, updateItem } from '@/services/social/evergreen';

const params = z.object({ id: z.string().uuid() }).strict();

export const PATCH = withApi(
  {
    id: 'social.evergreen.item_update',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_evergreen_item' },
    params,
    body: evergreenItemUpdate,
    auditExempt: 'The evergreen service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updateItem(actor, p.id, body) };
  },
);

export const DELETE = withApi(
  {
    id: 'social.evergreen.item_remove',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_evergreen_item' },
    params,
    auditExempt: 'The evergreen service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteItem(actor, p.id);
    return { data: { ok: true } };
  },
);
