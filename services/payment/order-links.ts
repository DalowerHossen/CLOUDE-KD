// path: services/payment/order-links.ts
// Payment links for orders of an outside store (checkout sessions of STEP 16, through the `payments` contract). The link is made
// on behalf of the owner who made the API key; no browser session is involved.
import 'server-only';
import { NotFoundError } from '@/lib/errors';
import type { Actor, OrderPaymentLink } from '@/types/contracts';
import { createPaymentLink, revokePaymentLink } from './links';

function actorFor(companyId: string, userId: string): Actor {
  return {
    userId,
    role: 'owner',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'checkout-session',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}

export async function createLinkForOrder(input: {
  companyId: string;
  invoiceId: string;
  createdBy: string;
  validHours: number | null;
}): Promise<OrderPaymentLink> {
  const made = await createPaymentLink(actorFor(input.companyId, input.createdBy), {
    invoiceId: input.invoiceId,
    amount: null,
    validHours: input.validHours,
  });
  return { linkId: made.id, url: made.url, expiresAt: made.expiresAt };
}

export async function revokeLinkForOrder(input: {
  companyId: string;
  linkId: string;
}): Promise<void> {
  await revokePaymentLink(
    actorFor(input.companyId, '00000000-0000-0000-0000-000000000000'),
    input.linkId,
  ).catch((error: unknown) => {
    // A link that is already stopped (or never existed) is the state we want.
    if (error instanceof NotFoundError) return;
    throw error;
  });
}
