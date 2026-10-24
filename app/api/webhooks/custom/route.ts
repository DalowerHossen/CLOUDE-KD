// path: app/api/webhooks/custom/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('custom');
