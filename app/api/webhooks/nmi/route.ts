// path: app/api/webhooks/nmi/route.ts
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

export const POST = processorWebhookRoute('nmi');
