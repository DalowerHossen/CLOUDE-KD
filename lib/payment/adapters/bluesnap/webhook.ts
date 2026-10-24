// path: lib/payment/adapters/bluesnap/webhook.ts
// BlueSnap webhooks (IPN) - FAIL CLOSED. The authentication of an IPN (headers bls-signature and bls-ipn-timestamp) is
// documented only on support.bluesnap.com, which this build could not read (docs/steps/STEP-11/BLOCKERS.md, B1). A webhook
// that cannot be authenticated is never accepted, and the algorithm is not written from a third party's description.
// Replace both functions when B1 is resolved.
import 'server-only';
import { createHash } from 'node:crypto';
import type { NormalizedWebhookEvent, WebhookRequest } from '@/types/contracts';

export async function verifyBluesnapWebhook(): Promise<boolean> {
  return false;
}

/** Maps every IPN to `unknown` without a transaction id; the event id is a digest of the body. */
export function parseBluesnapEvent(request: WebhookRequest): NormalizedWebhookEvent {
  const form = new URLSearchParams(request.rawBody);
  return {
    processorId: 'bluesnap',
    eventId: `bs_${createHash('sha256').update(request.rawBody).digest('hex')}`,
    type: 'unknown',
    processorTransactionId: null,
    occurredAt: new Date().toISOString(),
    payload: { bluesnapTransactionType: form.get('transactionType') },
  };
}
