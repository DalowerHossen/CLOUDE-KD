// path: app/api/webhooks/fastspring/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('fastspring');
