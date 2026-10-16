// path: app/api/notifications/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { NOTIFICATION_CATEGORIES } from '@/config/notifications';
import { ForbiddenError } from '@/lib/errors';
import {
  listNotifications,
  markRead,
  preferenceActionSchema,
  applyPreference,
  preferences,
} from '@/services/notification/notification-service';

export const GET = withApi(
  {
    id: 'notifications.list',
    scope: 'tenant',
    query: z
      .object({
        unread: z.enum(['0', '1']).optional(),
        category: z.enum(NOTIFICATION_CATEGORIES).optional(),
        before: z.string().datetime().optional(),
        preferences: z.enum(['0', '1']).optional(),
      })
      .strict(),
  },
  async ({ query, actor }): Promise<{ data: unknown }> => {
    if (!actor) throw new ForbiddenError();
    if (query.preferences === '1') return { data: await preferences(actor.userId) };
    return {
      data: await listNotifications(actor.userId, {
        unreadOnly: query.unread === '1',
        category: query.category,
        before: query.before,
      }),
    };
  },
);

/** Mark as read: { ids: [...] } for some, { all: true } for every unread one. */
export const PATCH = withApi(
  {
    id: 'notifications.read',
    scope: 'tenant',
    body: z.union([
      z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(),
      z.object({ all: z.literal(true) }).strict(),
    ]),
    auditExempt: "Marks the person's own notifications as read.",
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { updated: await markRead(actor.userId, 'ids' in body ? body.ids : null) } };
  },
);

export const POST = withApi(
  {
    id: 'notifications.preferences',
    scope: 'tenant',
    rateLimitPolicy: 'strict',
    body: preferenceActionSchema,
    auditExempt: "Changes only the person's own notification settings.",
  },
  async ({ body, actor, tenant }) => {
    if (!actor) throw new ForbiddenError();
    await applyPreference(actor.userId, tenant?.companyId ?? null, body);
    return { data: { done: true } };
  },
);
