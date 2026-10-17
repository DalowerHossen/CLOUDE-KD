// path: app/api/webhooks/authorizenet/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('authorizenet');
