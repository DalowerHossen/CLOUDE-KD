// path: app/api/social/evergreen/items/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { evergreenItemInput } from '@/lib/social/schedule';
import { createItem, listItems } from '@/services/social/evergreen';

export const GET = withApi(
  {
    id: 'social.evergreen.items',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_evergreen_item' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listItems(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'social.evergreen.item_create',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_evergreen_item' },
    body: evergreenItemInput,
    idempotent: true,
    auditExempt: 'The evergreen service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createItem(actor, body) };
  },
);
