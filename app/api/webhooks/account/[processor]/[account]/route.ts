// path: app/api/webhooks/account/[processor]/[account]/route.ts
// Webhooks of a company's own merchant account at a processor: the address given to that merchant carries the account id, so
// the signature is checked with that account's key (S16_040). The platform's own account keeps /api/webhooks/<processor>.
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { isKnownProcessor } from '@/lib/payment/registry';
import { processorWebhookRoute } from '@/lib/payment/webhook-route';

const params = z
  .object({ processor: z.string().regex(/^[a-z]{2,20}$/), account: z.string().uuid() })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ processor: string; account: string }> },
): Promise<Response> {
  const parsed = params.safeParse(await context.params);
  if (!parsed.success || !isKnownProcessor(parsed.data.processor))
    return new Response(null, { status: 404 });
  return processorWebhookRoute(parsed.data.processor, parsed.data.account)(request);
}
