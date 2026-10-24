// path: app/api/webhooks/rapyd/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('rapyd');
