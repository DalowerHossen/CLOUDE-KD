// path: app/api/webhooks/bluesnap/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('bluesnap');
