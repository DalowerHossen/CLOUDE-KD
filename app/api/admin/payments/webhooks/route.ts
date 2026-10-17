// path: app/api/admin/payments/webhooks/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { toInt } from '@/lib/reports/numbers';
import { listWebhookEvents } from '@/services/payment/webhook-core';

export const GET = withApi(
  {
    id: 'admin.paymentWebhooks.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payment.webhook.read', resourceType: 'webhook_event' },
    query: z
      .object({
        status: z.enum(['received', 'processed', 'failed', 'dead_letter', 'ignored']).optional(),
        limit: z
          .string()
          .regex(/^\d{1,3}$/)
          .optional(),
      })
      .strict(),
  },
  async ({ query }) => ({
    data: await listWebhookEvents({
      status: query.status,
      limit: Math.min(toInt(query.limit, 100), 200),
    }),
  }),
);
