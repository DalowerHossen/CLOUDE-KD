// path: app/api/webhooks/payproglobal/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('payproglobal');
