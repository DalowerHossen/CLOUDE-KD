// path: lib/payment/adapters/payarc/webhook.ts
// PayArc webhooks - FAIL CLOSED. The documentation describes the event bodies but no way to authenticate a delivery
// (no signature, secret, timestamp or source address; docs/steps/STEP-11/BLOCKERS.md, B2). A webhook that cannot be
// authenticated is never accepted, and no scheme is invented. Replace both functions when B2 is resolved.
import 'server-only';
import { createHash } from 'node:crypto';
import type { NormalizedWebhookEvent, WebhookRequest } from '@/types/contracts';

export async function verifyPayarcWebhook(): Promise<boolean> {
  return false;
}

/** Maps every delivery to `unknown` without a transaction id; the event id is a digest of the body. */
export function parsePayarcEvent(request: WebhookRequest): NormalizedWebhookEvent {
  const body = JSON.parse(request.rawBody) as Record<string, unknown>;
  const kind = typeof body.event_type === 'string' ? body.event_type : null;
  return {
    processorId: 'payarc',
    eventId: `pa_${createHash('sha256').update(request.rawBody).digest('hex')}`,
    type: 'unknown',
    processorTransactionId: null,
    occurredAt: new Date().toISOString(),
    payload: { payarcEvent: kind },
  };
}
