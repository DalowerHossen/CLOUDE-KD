// path: app/api/admin/payments/webhooks/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { retryWebhookEvent } from '@/services/payment/webhook-core';

const params = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.paymentWebhooks.retry',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'payment.webhook.retry', resourceType: 'webhook_event' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    auditExempt: 'The webhook core writes the audit entry.',
  },
  async ({ params: p }) => ({ data: { status: await retryWebhookEvent(p.id) } }),
);
