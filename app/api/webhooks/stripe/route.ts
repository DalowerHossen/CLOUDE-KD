// path: app/api/webhooks/stripe/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('stripe');
